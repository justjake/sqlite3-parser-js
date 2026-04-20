#!/usr/bin/env -S bun run
// Slim a parser.json or keywords.json defs down to only the fields
// the JS runtime actually reads.  The Makefile wires this in as the
// transformation `*.dev.json → *.prod.json`:
//
//     bun scripts/slim-dump.ts generated/<ver>/parser.dev.json \
//                              generated/<ver>/parser.prod.json
//     bun scripts/slim-dump.ts generated/<ver>/keywords.dev.json \
//                              generated/<ver>/keywords.prod.json
//
// The set of kept fields is driven by the `.prod` JSON Schemas exported
// from scripts/json-schemas.ts (which derive from src/lempar.ts and
// src/tokenize.ts).  To start preserving a new runtime-read field: add
// it to the relevant TypeBox type in scripts/json-schemas.ts — this
// script will pick it up automatically.

import { readFileSync, writeFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { Clean } from "typebox/value"

import { SCHEMAS, type SchemaName } from "./json-schemas.ts"
import type {
  ParserConstants,
  ParserDefs,
  ParserTables,
  SymbolId,
} from "../src/lempar.ts"

// ---------------------------------------------------------------------------
// Expected-terminal table.
//
// For each parser state N in [0, YYNSTATE), list the terminal ids that
// have an EXPLICIT shift/shift-reduce entry in the action table for
// this state.  We deliberately skip terminals that only "accept" via
// `yy_default[state]` (often a default reduce, which makes every
// lookahead technically valid but tells an error reporter nothing) or
// via fallback/wildcard redirection — those indirections are reported
// at the display layer by mapping fallbacks to "identifier".
//
// Algorithm matches `ParseCoverage` in tool/lempar.c (lines 529-541):
// walk `yy_lookahead[base..base+YYNTOKEN]` and keep slots where the
// stored lookahead equals the offset.  Linear in YYNTOKEN per state.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Rule-info tables.  Counterparts of lempar.c:720 `yyRuleInfoLhs[]`
// and lempar.c:726 `yyRuleInfoNRhs[]` (the C table stores the negative
// count; we store positive since our stack pops by count, not pointer
// arithmetic).  The dev `rules[]` carries both fields per rule; we
// flatten them so the runtime engine doesn't drag full rule objects
// onto its hot path.
// ---------------------------------------------------------------------------

export function computeRuleInfo(
  rules: readonly { readonly lhs: SymbolId; readonly rhs: readonly unknown[] }[],
): { yyRuleInfoLhs: SymbolId[]; yyRuleInfoNRhs: number[] } {
  const yyRuleInfoLhs: SymbolId[] = []
  const yyRuleInfoNRhs: number[] = []
  for (const rule of rules) {
    yyRuleInfoLhs.push(rule.lhs)
    yyRuleInfoNRhs.push(rule.rhs.length)
  }
  return { yyRuleInfoLhs, yyRuleInfoNRhs }
}

export function computeYyExpected(
  tables: Pick<ParserTables, "yy_lookahead" | "yy_shift_ofst">,
  constants: Pick<ParserConstants, "YYNSTATE" | "YYNTOKEN" | "YY_ACTTAB_COUNT">,
): number[][] {
  const { YYNSTATE, YYNTOKEN, YY_ACTTAB_COUNT } = constants
  const { yy_lookahead, yy_shift_ofst } = tables
  const out: number[][] = []
  for (let state = 0; state < YYNSTATE; state++) {
    const accepted: number[] = []
    const base = yy_shift_ofst[state]
    if (base != null) {
      for (let la = 0; la < YYNTOKEN; la++) {
        const i = base + la
        if (i < 0 || i >= YY_ACTTAB_COUNT) continue
        if (yy_lookahead[i] === la) accepted.push(la)
      }
    }
    out.push(accepted)
  }
  return out
}

// ---------------------------------------------------------------------------
// Detect kind by content shape so callers don't have to pass a flag.
// ---------------------------------------------------------------------------
function detectSchemaName(d: Record<string, unknown>): SchemaName {
  if ("rules" in d && "tables" in d && "symbols" in d) return "parser.prod"
  if ("keywords" in d && "meta" in d) return "keywords.prod"
  throw new Error(
    "Unrecognised defs shape: expected either a parser.json (with rules/tables/symbols) " +
      "or a keywords.json (with keywords/meta).",
  )
}

// ---------------------------------------------------------------------------
// Size reporter — useful for deciding whether to ship slim or not.
// ---------------------------------------------------------------------------
function sizes(buf: Buffer | string): { raw: number; gz: number } {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf
  return { raw: b.byteLength, gz: gzipSync(b).byteLength }
}

function fmt(n: number): string {
  if (n < 1024) return `${n} B`
  return `${(n / 1024).toFixed(1)} KB`
}

// ---------------------------------------------------------------------------
// CLI entry.
// ---------------------------------------------------------------------------
function main(): void {
  const [, , inPath, outPath] = process.argv
  if (!inPath || !outPath) {
    console.error("usage: bun scripts/slim-dump.ts <input.json> <output.json>")
    process.exit(2)
  }

  const inBytes = readFileSync(inPath)
  const defs = JSON.parse(inBytes.toString("utf8")) as Record<string, unknown>
  const schemaName = detectSchemaName(defs)
  // `Clean` returns `unknown`; the schema controls the resulting shape.
  // For parser.prod dumps, splice in the computed `yy_expected` table
  // so runtime diagnostics can render "expected: …" lists in O(|accepted|).
  let finalized: unknown = Clean(SCHEMAS[schemaName], defs)
  if (schemaName === "parser.prod") {
    const parserDefs = finalized as ParserDefs & {
      rules: readonly { lhs: SymbolId; rhs: readonly unknown[] }[]
    }
    const ruleInfo = computeRuleInfo(parserDefs.rules)
    finalized = {
      ...parserDefs,
      tables: {
        ...parserDefs.tables,
        yyRuleInfoLhs: ruleInfo.yyRuleInfoLhs,
        yyRuleInfoNRhs: ruleInfo.yyRuleInfoNRhs,
        yy_expected: computeYyExpected(parserDefs.tables, parserDefs.constants),
      },
    }
  }

  // Compact JSON — every saved byte counts when the defs dominates the bundle.
  const outText = JSON.stringify(finalized)
  writeFileSync(outPath, outText)

  const before = sizes(inBytes)
  const after = sizes(outText)
  const pct = (n: number, d: number) => ((1 - n / d) * 100).toFixed(1)
  console.log(`${inPath}  ->  ${outPath}  (schema: ${schemaName})`)
  console.log(
    `  raw:     ${fmt(before.raw)}  →  ${fmt(after.raw)}  (-${pct(after.raw, before.raw)}%)`,
  )
  console.log(`  gzipped: ${fmt(before.gz)}  →  ${fmt(after.gz)}  (-${pct(after.gz, before.gz)}%)`)
}

if (import.meta.main) {
  main()
}
