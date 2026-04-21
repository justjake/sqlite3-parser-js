#!/usr/bin/env -S bun run
// Slim a keywords.json defs down to only the fields the JS runtime
// actually reads.  The Makefile wires this in as the transformation
// `keywords.dev.json → keywords.prod.json`:
//
//     bun scripts/slim-dump.ts generated/<ver>/keywords.dev.json \
//                              generated/<ver>/keywords.prod.json
//
// The set of kept fields is driven by the `keywords.prod` JSON Schema
// exported from scripts/json-schemas.ts (which derives from
// src/tokenize.ts).  To start preserving a new runtime-read field:
// add it to the TypeBox type there — this script picks it up
// automatically.
//
// This file also exports `computeRuleInfo` and `computeYyExpected`,
// which `scripts/emit-ts-parser.ts` uses to derive runtime tables from
// the dev-dump `rules[]` / `tables.*` fields.

import { readFileSync, writeFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { Clean } from "typebox/value"

import { SCHEMAS, type SchemaName } from "./json-schemas.ts"
import { runScript } from "./utils.ts"
import type { ParserConstants, ParserTables, SymbolId } from "../src/lempar.ts"

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
  if ("keywords" in d && "meta" in d) return "keywords.prod"
  throw new Error("Unrecognised defs shape: expected a keywords.json (with keywords/meta).")
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

await runScript(
  import.meta.main,
  { usage: "usage: bun scripts/slim-dump.ts <input.json> <output.json>" },
  ({ positionals }) => {
    const [inPath, outPath] = positionals
    if (!inPath || !outPath) {
      console.error("usage: bun scripts/slim-dump.ts <input.json> <output.json>")
      process.exit(2)
    }

    const inBytes = readFileSync(inPath)
    const defs = JSON.parse(inBytes.toString("utf8")) as Record<string, unknown>
    const schemaName = detectSchemaName(defs)
    // `Clean` returns `unknown`; the schema controls the resulting shape.
    const finalized: unknown = Clean(SCHEMAS[schemaName], defs)

    // Compact JSON — every saved byte counts when the defs dominates the bundle.
    const outText = JSON.stringify(finalized)
    writeFileSync(outPath, outText)

    const before = sizes(inBytes)
    const after = sizes(outText)
    const pct = (n: number, d: number) => ((1 - n / d) * 100).toFixed(1)
    console.error(`${inPath}  ->  ${outPath}  (schema: ${schemaName})`)
    console.error(
      `  raw:     ${fmt(before.raw)}  →  ${fmt(after.raw)}  (-${pct(after.raw, before.raw)}%)`,
    )
    console.error(
      `  gzipped: ${fmt(before.gz)}  →  ${fmt(after.gz)}  (-${pct(after.gz, before.gz)}%)`,
    )
  },
)
