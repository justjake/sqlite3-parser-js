// Dist-test comparative benchmarks: ours (published package) vs other
// JS/WASM SQL parsers from npm. Omits liteparser (TypeScript ESM
// wrapper with .js-extension imports that Node can't resolve); the
// full compare with liteparser runs via `bun run bench:compare` from
// source. Runs under Bun or Node — see scripts/dist-bench.ts.

import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { run, bench, group, summary, do_not_optimize } from "mitata"
import * as ours from "sqlite3-parser"
import {
  printAggregateTable,
  printParserHeader,
  printReadmeSummaryTable,
} from "../scripts/bench-report.mjs"
// `sqlite-parser` and `@appland/sql-parser` don't publish types; import
// bare since this file is already .mjs (no type checking).
import sqliteParser from "sqlite-parser"
import applandParse from "@appland/sql-parser"
import nodeSqlParserModule from "node-sql-parser"
import { parse as pgAstParse } from "pgsql-ast-parser"
import { Parser as SqlParserTs, init as sqlParserTsInit } from "@guanmingchiu/sqlparser-ts"
import { Dialect as PolyglotDialect, parse as polyglotParseRaw } from "@polyglot-sql/sdk"
import { DEEP, LARGE, MEDIUM, SMALL, TINY } from "./bench-fixtures.mjs"

const { Parser: NodeSqlParser } = nodeSqlParserModule

function readPkg(specifier) {
  // Resolve a package's entry URL, then walk up to find its package.json.
  // Works regardless of exports-map restrictions (Node enforces them for
  // `import ... with { type: "json" }` but not for a direct file read).
  const entry = new URL(import.meta.resolve(specifier))
  let dir = new URL(".", entry)
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(readFileSync(new URL("package.json", dir), "utf8"))
      if (pkg.name === specifier) return pkg
    } catch {}
    const parent = new URL("..", dir)
    if (parent.href === dir.href) break
    dir = parent
  }
  return { name: specifier }
}

const ourPkg = readPkg("sqlite3-parser")
const sqliteParserPkg = readPkg("sqlite-parser")
const applandPkg = readPkg("@appland/sql-parser")
const nodeSqlParserPkg = readPkg("node-sql-parser")
const pgsqlAstParserPkg = readPkg("pgsql-ast-parser")
const sqlParserTsPkg = readPkg("@guanmingchiu/sqlparser-ts")
const polyglotPkg = readPkg("@polyglot-sql/sdk")

await sqlParserTsInit()
const nodeSql = new NodeSqlParser()
const nodeSqlOpt = { database: "sqlite" }

function ourParse(sql) {
  const r = ours.parse(sql)
  if (r.status !== "ok") throw new Error(`ours parse failed: ${r.errors[0]?.message}`)
  return r
}

function polyglotParse(sql) {
  const result = polyglotParseRaw(sql, PolyglotDialect.SQLite)
  if (!result.success) {
    throw new Error(result.error ?? "Polyglot SQL parse failed")
  }
  return result.ast
}

function formatSqlBytes(sql) {
  const bytes = Buffer.byteLength(sql, "utf8")
  if (bytes < 1024) return `${bytes}b`
  const kb = bytes / 1024
  return `${kb < 10 ? kb.toFixed(1) : kb.toFixed(0)}kb`
}

function caseLabel(name, sql) {
  return `${name} (${formatSqlBytes(sql)})`
}

const competitors = [
  { label: "ours", parse: (sql) => ourParse(sql), pkg: ourPkg },
  { label: "sqlite-parser", parse: (sql) => sqliteParser(sql), pkg: sqliteParserPkg },
  { label: "@appland/sql-parser", parse: (sql) => applandParse(sql), pkg: applandPkg },
  {
    label: "node-sql-parser",
    parse: (sql) => nodeSql.astify(sql, nodeSqlOpt),
    pkg: nodeSqlParserPkg,
  },
  { label: "pgsql-ast-parser", parse: (sql) => pgAstParse(sql), pkg: pgsqlAstParserPkg },
  {
    label: "@guanmingchiu/sqlparser-ts (wasm)",
    parse: (sql) => SqlParserTs.parse(sql, "sqlite"),
    pkg: sqlParserTsPkg,
  },
  {
    label: "@polyglot-sql/sdk (wasm)",
    parse: (sql) => polyglotParse(sql),
    pkg: polyglotPkg,
  },
]

const cases = [
  ["tiny", TINY],
  ["small", SMALL],
  ["medium", MEDIUM],
  ["large", LARGE],
  ["deep", DEEP],
]

const canHandle = new Map()
function probe(label, sql) {
  const ok = new Set()
  for (const c of competitors) {
    try {
      c.parse(sql)
      ok.add(c.label)
    } catch (e) {
      if (c.label === "ours") throw e
      console.warn(`${label}: skipping ${c.label} (${e.message})`)
    }
  }
  canHandle.set(label, ok)
}

for (const [name, sql] of cases) probe(caseLabel(name, sql), sql)

function groupFor(label, sql) {
  const ok = canHandle.get(label) ?? new Set()
  group(label, () => {
    summary(() => {
      for (const c of competitors) {
        if (!ok.has(c.label)) continue
        const b = bench(`${label} / ${c.label}`, () => do_not_optimize(c.parse(sql)))
        if (c.label === "ours") b.baseline(true)
      }
    })
  })
}

for (const [name, sql] of cases) groupFor(caseLabel(name, sql), sql)

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    filter: { type: "string" },
    md: { type: "boolean" },
  },
  strict: false,
})

const md = Boolean(values.md)
if (md) printParserHeader(competitors)

// Capture mitata's per-line output via its `print` hook so we can emit
// a README-compatible summary table FIRST. Without the reorder the
// summary would land below the five per-input tables in the CI job
// summary, defeating the copy-paste-into-README workflow.
const captured = []
const result = await run({
  ...(values.filter ? { filter: new RegExp(values.filter) } : {}),
  ...(md
    ? {
        format: "markdown",
        colors: false,
        print: (s) => captured.push(s),
      }
    : {}),
})

if (md) {
  printReadmeSummaryTable(result.benchmarks)
  process.stdout.write("\n")
  for (const line of captured) process.stdout.write(line + "\n")
}
printAggregateTable(result.benchmarks, md)
