// Dist-test comparative benchmarks: ours (published package) vs other
// JS/WASM SQL parsers from npm.  Omits liteparser (TypeScript ESM
// wrapper with .js-extension imports that Node can't resolve); the
// full compare with liteparser runs via `bun run bench:compare` from
// source.  Runs under Bun or Node — see scripts/dist-bench.ts.

import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { run, bench, group, summary, do_not_optimize } from "mitata"
import * as ours from "sqlite3-parser"
// `sqlite-parser` and `@appland/sql-parser` don't publish types; import
// bare since this file is already .mjs (no type checking).
import sqliteParser from "sqlite-parser"
import applandParse from "@appland/sql-parser"
import nodeSqlParserModule from "node-sql-parser"
import { parse as pgAstParse } from "pgsql-ast-parser"
import { Parser as SqlParserTs, init as sqlParserTsInit } from "@guanmingchiu/sqlparser-ts"
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

await sqlParserTsInit()
const nodeSql = new NodeSqlParser()
const nodeSqlOpt = { database: "sqlite" }

function ourParse(sql) {
  const r = ours.parse(sql)
  if (r.status !== "ok") throw new Error(`ours parse failed: ${r.errors[0]?.message}`)
  return r
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

probe("tiny", TINY)
probe("small", SMALL)
probe("medium", MEDIUM)
probe("large (wide create table)", LARGE)
probe("deep (nested expr + subquery)", DEEP)

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

groupFor("tiny", TINY)
groupFor("small", SMALL)
groupFor("medium", MEDIUM)
groupFor("large (wide create table)", LARGE)
groupFor("deep (nested expr + subquery)", DEEP)

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    filter: { type: "string" },
    md: { type: "boolean" },
  },
  strict: false,
})

if (values.md) printParserHeader(competitors)
const result = await run({
  ...(values.filter ? { filter: new RegExp(values.filter) } : {}),
  ...(values.md ? { format: "markdown", colors: false } : {}),
})
printAggregateTable(result.benchmarks, Boolean(values.md))

function printAggregateTable(benchmarks, md = false) {
  const trials = benchmarks
    .map((t) => {
      const idx = t.alias.lastIndexOf(" / ")
      if (idx < 0) return undefined
      const avg = t.runs[0]?.stats?.avg
      if (avg === undefined) return undefined
      return { label: t.alias.slice(0, idx), competitor: t.alias.slice(idx + 3), avg }
    })
    .filter(Boolean)

  if (trials.length === 0) return

  const labels = [...new Set(trials.map((t) => t.label))]
  const cols_ = [...new Set(trials.map((t) => t.competitor))]
  const byKey = new Map()
  for (const t of trials) byKey.set(`${t.label}\0${t.competitor}`, t.avg)

  const BASELINE = "ours"
  const cols = [{ header: "input", cell: (l) => l }]
  for (const c of cols_) {
    cols.push({ header: c, cell: (l) => formatAvg(byKey.get(`${l}\0${c}`)) })
    if (c !== BASELINE) {
      cols.push({ header: `vs ${BASELINE}`, cell: (l) => formatRatio(byKey, l, c, BASELINE) })
    }
  }

  const print = (s) => process.stdout.write(s + "\n")
  print("")
  if (md) {
    print("### aggregate (avg / iter)")
    print("")
    print("| " + cols.map((c) => c.header).join(" | ") + " |")
    print("| " + cols.map(() => "---").join(" | ") + " |")
    for (const l of labels) print("| " + cols.map((c) => c.cell(l)).join(" | ") + " |")
    return
  }

  const widths = cols.map((c) =>
    Math.max(c.header.length, ...labels.map((l) => stripAnsi(c.cell(l)).length)),
  )
  const rule = widths.map((w) => "─".repeat(w)).join("─┼─")
  const join = (parts) => parts.map((p, i) => padEnd(p, widths[i])).join(" │ ")

  print("aggregate (avg / iter)")
  print(join(cols.map((c) => c.header)))
  print(rule)
  for (const l of labels) print(join(cols.map((c) => c.cell(l))))
}

function formatAvg(avg) {
  if (avg === undefined) return "—"
  if (avg < 1_000) return `${avg.toFixed(1)} ns`
  if (avg < 1_000_000) return `${(avg / 1_000).toFixed(2)} µs`
  if (avg < 1_000_000_000) return `${(avg / 1_000_000).toFixed(2)} ms`
  return `${(avg / 1_000_000_000).toFixed(2)} s`
}

function formatRatio(byKey, label, competitor, baseline) {
  const a = byKey.get(`${label}\0${competitor}`)
  const b = byKey.get(`${label}\0${baseline}`)
  if (a === undefined || b === undefined) return "—"
  if (a >= b) return `${(a / b).toFixed(2)}× slower`
  return `${(b / a).toFixed(2)}× faster`
}

function printParserHeader(parsers) {
  const print = (s) => process.stdout.write(s + "\n")
  print("## parsers under test")
  print("")
  for (const c of parsers) {
    const pkg = c.pkg
    const version = pkg.version ? ` \`${pkg.version}\`` : ""
    const link = packageLink(pkg)
    const name = link ? `[\`${pkg.name}\`](${link})` : `\`${pkg.name}\``
    const desc = pkg.description ? ` — ${pkg.description}` : ""
    print(`- **${c.label}**: ${name}${version}${desc}`)
  }
  print("")
}

function packageLink(pkg) {
  if (pkg.homepage) return pkg.homepage
  const repo = pkg.repository
  if (!repo) return undefined
  const raw = typeof repo === "string" ? repo : repo.url
  if (!raw) return undefined
  return normalizeRepoUrl(raw)
}

function normalizeRepoUrl(raw) {
  let url = raw.replace(/^git\+/, "").replace(/\.git$/, "")
  const sshMatch = url.match(/^git@([^:]+):(.+)$/)
  if (sshMatch) url = `https://${sshMatch[1]}/${sshMatch[2]}`
  return url
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

function padEnd(s, w) {
  const visible = stripAnsi(s).length
  return visible >= w ? s : s + " ".repeat(w - visible)
}
