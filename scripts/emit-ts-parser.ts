#!/usr/bin/env bun
// Emit a self-contained TypeScript parser module from parser.dev.json.
//
// Usage:
//   bun scripts/emit-ts-parser.ts <version>
//
// Reads:  generated/<version>/parser.dev.json
// Writes: generated/<version>/lemonpar2.ts
//
// The emitted file is the TypeScript equivalent of what Lemon's C-targeted
// code-generator emits for parse.y: it bakes in the LALR tables, rule
// metadata, and per-rule reducer actions.  It depends on src/lempar.ts
// for the engine driver (shift/reduce dispatch) and src/ast/nodes.ts for
// the AST types referenced by the action bodies.
//
// The `actionC` text lemon writes is post-rewrite — it has already
// translated alias names like `A`, `X`, `Y` into `yymsp[...].minor.yyN`
// stack-slot accesses.  This emitter reverses that mapping using the
// rule's `lhsAlias`, `rhs[i].alias`, and `nrhs` data so the generated
// reducer reads like the original parse-ts.y action bodies.

import { promises as fs } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Shape of parser.dev.json (only the fields we consume).
// ---------------------------------------------------------------------------

interface RawRhsPos {
  readonly pos: number;
  readonly alias: string | null;
  readonly symbol?: number;
  readonly name?: string;
  readonly multi?: ReadonlyArray<{
    readonly symbol: number;
    readonly name: string;
  }>;
}

interface RawRule {
  readonly id: number;
  readonly lhs: number;
  readonly lhsName: string;
  readonly lhsAlias?: string | null;
  readonly nrhs: number;
  readonly rhs: readonly RawRhsPos[];
  readonly doesReduce: boolean;
  readonly canReduce: boolean;
  readonly neverReduce: boolean;
  readonly noCode: boolean;
  readonly actionC?: string;
  readonly codePrefix?: string | null;
  readonly codeSuffix?: string | null;
}

interface RawSymbol {
  readonly id: number;
  readonly name: string;
  readonly type: "TERMINAL" | "NONTERMINAL" | "MULTITERMINAL";
  readonly isTerminal: boolean;
  readonly datatype?: string;
  readonly dtnum?: number;
  readonly lambda?: boolean;
  readonly useCnt?: number;
}

interface RawTables {
  readonly yy_action: readonly number[];
  readonly yy_lookahead: readonly number[];
  readonly yy_shift_ofst: readonly number[];
  readonly yy_reduce_ofst: readonly number[];
  readonly yy_default: readonly number[];
  readonly yyFallback?: readonly number[];
}

interface RawDump {
  readonly meta: { readonly sourceFile: string };
  readonly name: string;
  readonly tokenPrefix: string;
  readonly tokenType: string;
  readonly preamble: string;
  readonly syntaxError: string;
  readonly stackOverflow: string;
  readonly extraContext: string;
  readonly constants: Record<string, number>;
  readonly symbols: readonly RawSymbol[];
  readonly rules: readonly RawRule[];
  readonly tables: RawTables;
}

// ---------------------------------------------------------------------------
// Rewriter for action-body text: reverse Lemon's alias-to-stack-slot
// translation so the emitted cases read like the original .y source.
// ---------------------------------------------------------------------------

/**
 * Compute the yymsp stack offset for RHS position `i` given a rule's
 * `nrhs`.  Matches Lemon's convention: RHS[i] sits at
 * `yymsp[i - (nrhs - 1)]`, so the last-shifted RHS entry is at
 * `yymsp[0]` and earlier entries sit at negative offsets.
 */
function rhsOffset(i: number, nrhs: number): number {
  return i - (nrhs - 1);
}

/**
 * Compute the yymsp offset of the LHS for a rule.  For `nrhs === 0`
 * Lemon synthesises the LHS at `yymsp[+1]` (pushing a new slot); for
 * `nrhs >= 1` the LHS reuses the slot of RHS[0] at `yymsp[-(nrhs - 1)]`.
 */
function lhsOffset(nrhs: number): number {
  return nrhs === 0 ? 1 : -(nrhs - 1);
}

/**
 * Build a slot-offset → alias-name map for one rule.  RHS aliases take
 * priority on their own slot; the LHS alias goes in the LHS slot only
 * if that slot isn't already claimed by an aliased RHS position (a
 * collision forces Lemon to write to `yylhsminor` instead, which we
 * handle separately).
 */
function slotMapFor(rule: RawRule): {
  slot: Map<number, string>;
  lhsUsesLhsminor: boolean;
} {
  const slot = new Map<number, string>();
  for (let i = 0; i < rule.nrhs; i++) {
    const a = rule.rhs[i]?.alias;
    if (a) slot.set(rhsOffset(i, rule.nrhs), a);
  }
  let lhsUsesLhsminor = false;
  if (rule.lhsAlias) {
    const lhsSlot = lhsOffset(rule.nrhs);
    if (slot.has(lhsSlot)) {
      lhsUsesLhsminor = true;
    } else {
      slot.set(lhsSlot, rule.lhsAlias);
    }
  }
  return { slot, lhsUsesLhsminor };
}

/**
 * Reverse Lemon's alias-to-slot translation on an action body, returning
 * TypeScript that reads like the original grammar source.  Strips the
 * leading whitespace and any `#line` markers; leaves non-stack text
 * verbatim.
 */
function rewriteAction(rule: RawRule, actionC: string): string {
  const { slot, lhsUsesLhsminor } = slotMapFor(rule);

  let out = actionC;
  // yylhsminor.yyN → LHS alias.
  if (rule.lhsAlias && lhsUsesLhsminor) {
    out = out.replace(/yylhsminor\.yy\d+/g, rule.lhsAlias);
  }
  // yymsp[N].minor.yyN → the alias at offset N (if any).
  out = out.replace(/yymsp\[(-?\d+)\]\.minor\.yy\d+/g, (m, offStr) => {
    const off = Number(offStr);
    const alias = slot.get(off);
    return alias ?? m;
  });
  // yymsp[N].major → @alias (we don't use @-token-type in parse-ts.y,
  // but handle it so a future use doesn't silently leak the raw token).
  out = out.replace(/yymsp\[(-?\d+)\]\.major/g, (m, offStr) => {
    const off = Number(offStr);
    const alias = slot.get(off);
    return alias ? `${alias}.type` : m;
  });
  // Strip any `#line N "file"` directives lemon injected.
  out = out.replace(/^#line \d+ "[^"]+"\n?/gm, "");
  return out;
}

// ---------------------------------------------------------------------------
// Preamble handling.
// ---------------------------------------------------------------------------

/**
 * Sanitize the `preamble` section from the JSON into the inlined
 * `%include` body we emit at the top of the generated module: strip
 * `#line` markers, drop the `declare const tokens` stub, and rewrite
 * the `src/ast/nodes.ts` import path (which was relative to the .y
 * file's directory, `generated/<ver>/lemon/`) so it resolves relative
 * to the output file, `generated/<ver>/`.
 */
function preparePreamble(preamble: string): string {
  return (
    preamble
      // Strip #line directives — valid in C-preprocessed output, not TS.
      .replace(/^#line \d+ "[^"]+"\n?/gm, "")
      // The grammar spec declares `tokens` for self-contained
      // type-checking.  The emitter supplies the real binding, so the
      // stub must go.
      .replace(/\/\/ eslint-disable-next-line[^\n]*\n/g, "")
      .replace(/declare const tokens: Record<string, number>;\s*/g, "")
      // The grammar file sits one directory deeper than the output; fix
      // any "../../../src/..." paths to "../../src/...".
      .replace(/"\.\.\/\.\.\/\.\.\/src\//g, '"../../src/')
      .trimEnd()
  );
}

// ---------------------------------------------------------------------------
// Section emitters.
// ---------------------------------------------------------------------------

function emitHeader(version: string): string {
  return `// GENERATED by scripts/emit-ts-parser.ts — DO NOT EDIT.
// Source: generated/${version}/parser.dev.json
// Regenerate with: make generated/${version}/lemonpar2.ts

/* eslint-disable */
/* prettier-ignore */`;
}

function emitImports(): string {
  return `import {
  engineModuleForGrammar,
  type LalrPopped,
  type LalrReduce,
  type ParserDefs,
  type RuleId,
  type SymbolId,
  type TokenId,
} from "../../src/lempar.ts"`;
}

/** Emit a `const tokens = { … } as const` holding every terminal's TK_* code. */
function emitTokenCodes(dump: RawDump): string {
  const lines: string[] = [];
  lines.push(
    "/** TK_* → numeric token code, populated from the generated grammar. */",
  );
  lines.push("export const tokens = {");
  for (const sym of dump.symbols) {
    if (!sym.isTerminal) continue;
    if (sym.type === "MULTITERMINAL") continue;
    if (sym.name === "$") continue; // end-of-input sentinel
    // Some internal tokens contain characters not valid in TS identifiers
    // (the empty name from Lemon's synthesised entries); skip them.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sym.name)) continue;
    lines.push(`  ${sym.name}: ${sym.id},`);
  }
  lines.push("} as const");
  return lines.join("\n");
}

const CONSTANTS = [
  "YYNSTATE",
  "YYNRULE",
  "YYNTOKEN",
  "YYNSYMBOL",
  "YY_MAX_SHIFT",
  "YY_MIN_SHIFTREDUCE",
  "YY_MAX_SHIFTREDUCE",
  "YY_ERROR_ACTION",
  "YY_ACCEPT_ACTION",
  "YY_NO_ACTION",
  "YY_MIN_REDUCE",
  "YY_MAX_REDUCE",
  "YY_ACTTAB_COUNT",
  "YY_SHIFT_COUNT",
  "YY_REDUCE_COUNT",
  "YYWILDCARD",
  "YYFALLBACK",
] as const;

const TABLE_TYPES = {
  yy_action: "number[]",
  yy_lookahead: "SymbolId[]",
  yy_shift_ofst: "number[]",
  yy_reduce_ofst: "number[]",
  yy_default: "number[]",
  yyFallback: "TokenId[]",
  yy_expected: "TokenId[][]",
}

/** Emit the PARSER_DEFS constant consumed by engineModuleForGrammar. */
function emitParserDefs(dump: RawDump): string {
  const lines: string[] = [];
  lines.push("// ---- LALR parser tables ----");
  lines.push("");
  lines.push("const CONSTANTS = {");
  for (const k of []) {
    const v = dump.constants[k];
    if (v === undefined) throw new Error(`missing constant ${k}`);
    lines.push(`  ${k}: ${v},`);
  }
  lines.push("} as const");
  lines.push("");

  // Emit each large table as a compact comma-separated array.  Readability
  // over size here — the file is roughly 50-60KB for 3.54.0, which is
  // fine since it's a build output.
  const packArr = (name: string, ty: string, xs: readonly number[]): string => {
    const chunks: string[] = [];
    for (let i = 0; i < xs.length; i += 16) {
      chunks.push("  " + xs.slice(i, i + 16).join(", "));
    }
    return `const ${name} = [\n${chunks.join(",\n")},\n] as unknown as ${ty}`;
  };

  for (const [name, ty] of Object.entries(TABLE_TYPES)) {
    const xs = dump.tables[name as keyof RawTables];
    if (xs === undefined) throw new Error(`missing table ${name}`);
    lines.push(packArr(name, ty, xs as readonly number[]));
    lines.push("");
  }

  lines.push("");

  lines.push('const SYMBOLS: ParserDefs["symbols"] = [');
  for (const s of dump.symbols) {
    lines.push(`  ${JSON.stringify(s.name)},`);
  }
  lines.push("]");
  lines.push("");

  lines.push(`export const PARSER_DEFS: ParserDefs = {
    constants: CONSTANTS,
    tables: {
      ${Object.keys(TABLE_TYPES).join(",\n")}
    },
    symbols: SYMBOLS,
  }`);
  return lines.join("\n");
}

/**
 * Choose a TypeScript type for a stack-value binding.  `datatype` comes
 * from a `%type` declaration; terminals inherit the grammar-level
 * `%token_type`.  Fall back to `unknown` if neither resolves.
 */
function typeForSymbol(dump: RawDump, sym: RawSymbol): string {
  if (sym.datatype && sym.datatype.trim().length > 0) return sym.datatype;
  if (sym.isTerminal) return dump.tokenType;
  return "unknown";
}

/** Emit the reducer's switch-case for one rule. */
function emitReducerCase(dump: RawDump, rule: RawRule): string {
  const lines: string[] = [];
  const rhsSig = rule.rhs
    .map((p) => {
      const nm = p.name ?? "?";
      return p.alias ? `${nm}(${p.alias})` : nm;
    })
    .join(" ");
  const header = `${rule.lhsName}${rule.lhsAlias ? `(${rule.lhsAlias})` : ""} ::= ${rhsSig}`;
  lines.push(`    case ${rule.id}: { // ${header}`);

  // Bind each aliased RHS position to a local variable (skip LHS-alias
  // RHS collisions — they get their own `let` below).
  const { lhsUsesLhsminor } = slotMapFor(rule);
  const lhsSharesRhs0 =
    rule.lhsAlias && rule.nrhs > 0 && rule.rhs[0]?.alias === rule.lhsAlias;
  for (let i = 0; i < rule.nrhs; i++) {
    const p = rule.rhs[i]!;
    if (!p.alias) continue;
    if (lhsSharesRhs0 && i === 0) continue; // the `let A` below covers this slot
    const sym =
      p.symbol !== undefined
        ? dump.symbols[p.symbol]
        : p.multi && p.multi[0]
          ? dump.symbols[p.multi[0].symbol]
          : undefined;
    const ty = sym ? typeForSymbol(dump, sym) : "unknown";
    lines.push(`      const ${p.alias} = popped[${i}].minor as ${ty}`);
  }

  // If there's an LHS alias, declare it as a mutable local so the
  // action body can assign to it.  Its type comes from the LHS symbol's
  // %type declaration.
  let retExpr: string | null = null;
  if (rule.lhsAlias) {
    const lhsSym = dump.symbols[rule.lhs];
    const ty = lhsSym ? typeForSymbol(dump, lhsSym) : "unknown";
    if (lhsSharesRhs0) {
      // Initialise from popped[0] so rules like `signed(A) ::= plus_num(A).`
      // with empty actions still work.
      lines.push(
        `      let ${rule.lhsAlias}: ${ty} = popped[0].minor as ${ty}`,
      );
    } else {
      // Fall back to a type that admits `undefined` so the action body
      // can assign into the local before the implicit return.  If the
      // declared datatype already includes `undefined` we'd emit a
      // `T | undefined | undefined`; TS tolerates that but it's noise.
      const widened = /\bundefined\b/.test(ty) ? ty : `${ty} | undefined`;
      lines.push(`      let ${rule.lhsAlias}: ${widened}`);
    }
    retExpr = rule.lhsAlias;
  }

  // Paste the rewritten action body (if any).  noCode rules have no
  // action; pure pass-through is handled by the RHS→LHS initialisation
  // above.
  if (!rule.noCode && rule.actionC && rule.actionC.trim().length > 0) {
    const body = rewriteAction(rule, rule.actionC)
      .split("\n")
      .map((l) => (l.length > 0 ? "      " + l : l))
      .join("\n");
    lines.push(body.trimEnd());
  }

  // Return value.  For noCode pass-through rules without an lhsAlias,
  // forward popped[0] if there is one; otherwise return undefined.
  if (retExpr) {
    lines.push(`      return ${retExpr}`);
  } else if (rule.nrhs > 0 && rule.noCode) {
    lines.push(`      return popped[0].minor`);
  } else {
    lines.push(`      return undefined`);
  }
  lines.push(`    }`);
  return lines.join("\n");
}

function emitReducer(dump: RawDump): string {
  const cases = dump.rules.map(rule => emitReducerCase(dump, rule)).join("\n");
  return `
/**
 * Reducer function that dispatches the actions defined for each rule in the grammar to build the AST.
 */
export const reduce: LalrReduce<ParseState, unknown> = (ctx, ruleId, popped) => {
  const err = (message: string, span: Span, ...hints: { message: string, span?: Span }[]) => {
    ctx.errors.push({ message, span, hints });
  }
  const nodeSpan = (): Span => spanFromPopped(popped)

  switch (ruleId as number) {
    ${cases}
    default:
      return undefined
  }
}
`
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: bun scripts/emit-ts-parser.ts <version>");
    process.exit(2);
  }
  const inputPath = path.join("generated", version, "parser.dev.json");
  const outputPath = path.join("generated", version, "lemonpar2.ts");

  const raw = await fs.readFile(inputPath, "utf-8");
  const dump = JSON.parse(raw) as RawDump;

  const parts: string[] = [];
  parts.push(emitHeader(version));
  parts.push("");
  parts.push(emitImports());
  parts.push("");
  parts.push("// ---- Preamble (inlined from the .y %include) ----");
  parts.push("");
  parts.push(preparePreamble(dump.preamble));
  parts.push("");
  parts.push(emitTokenCodes(dump));
  parts.push("");
  parts.push(emitParserDefs(dump));
  parts.push("");
  parts.push(emitReducer(dump));
  parts.push("");

  await fs.writeFile(outputPath, parts.join("\n"));
  console.log(`wrote ${outputPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
