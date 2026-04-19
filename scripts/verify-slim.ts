#!/usr/bin/env -S bun run
// Smoke-test that the slim (prod) dumps actually parse the same SQL as
// the full (dev) dumps.  Run after every change to scripts/slim-dump.ts
// (or after editing the field-keep tables there) to catch any field
// that the runtime reads but the slimmer drops.
//
// Pinned to 3.54.0 today.  Add more version imports + a matrix loop
// when we support additional versions — or better, drive from argv.

import full from "../generated/3.54.0/parser.dev.json" with { type: "json" }
import fullKw from "../generated/3.54.0/keywords.dev.json" with { type: "json" }
import slim from "../generated/3.54.0/parser.prod.json" with { type: "json" }
import slimKw from "../generated/3.54.0/keywords.prod.json" with { type: "json" }
import { parserModuleForGrammar } from "../src/parser.ts"
import { formatCst } from "../src/extras.ts"

const SAMPLES = [
  "SELECT 1",
  "SELECT 1; SELECT 2;",
  "INSERT INTO t VALUES (1, 'a')",
  "SELECT * FROM t WHERE x BETWEEN 1 AND 5 ORDER BY y DESC",
  `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<10)
   SELECT * FROM n;`,
  `CREATE TABLE t (
     id INTEGER PRIMARY KEY,
     x  TEXT NOT NULL DEFAULT 'foo',
     y  REAL CHECK (y > 0)
   );`,
]

const fullParser = parserModuleForGrammar({
  SQLITE_VERSION: "3.54.0",
  PARSER_DEFS: full as any,
  KEYWORD_DEFS: fullKw as any,
  options: {},
})
const slimParser = parserModuleForGrammar({
  SQLITE_VERSION: "3.54.0",
  PARSER_DEFS: slim as any,
  KEYWORD_DEFS: slimKw as any,
  options: {},
})

let pass = 0,
  fail = 0
for (const sql of SAMPLES) {
  const a = fullParser.parse(sql)
  const b = slimParser.parse(sql)
  const sa = a.cst ? formatCst(a.cst) : `<errors: ${a.errors.length}>`
  const sb = b.cst ? formatCst(b.cst) : `<errors: ${b.errors.length}>`
  if (sa === sb) {
    pass++
  } else {
    fail++
    console.error(`MISMATCH: ${JSON.stringify(sql)}`)
    console.error("  full:", sa.slice(0, 120))
    console.error("  slim:", sb.slice(0, 120))
  }
}
console.log(`${pass} pass, ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)
