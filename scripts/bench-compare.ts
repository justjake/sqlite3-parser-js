// Comparative parse benchmarks: ours vs liteparser (WASM) vs
// several pure-JS / WASM SQL parsers from npm.
//
// Run with `bun run bench:compare`.  Liteparser must be built first —
// `make liteparser-wasm` (requires emscripten).
// Pass `--filter=<regex>` or `--filter <regex>` to restrict which
// benches run.
//
// Caveats worth keeping in mind when reading the numbers:
//   * Each parser produces a different AST shape.  We measure time to
//     go from SQL string → parser's own representation.  Not an
//     AST-equivalence benchmark.
//   * Liteparser is C compiled to WASM.  Its `parse(sql)` path
//     (see vendor/liteparser/wasm/src/liteparser.ts) runs the C parser,
//     serialises the C AST to a JSON string inside WASM, decodes that
//     to a JS string via `UTF8ToString`, then `JSON.parse`s it into
//     JS objects.  The JSON round-trip is a non-trivial share of the
//     measured cost and reflects the wrapper's marshalling strategy,
//     not C parsing in isolation; a HEAPU32-walking marshaller would
//     be faster.
//   * sqlite-parser (npm) is a PEG.js-generated pure-JS parser for a
//     SQLite grammar.
//   * @appland/sql-parser is a more recently maintained fork of
//     sqlite-parser with additional grammar coverage — also pure JS.
//   * node-sql-parser is a PEG.js-derived multi-dialect parser.  We
//     run it with `database: "sqlite"` to pick its SQLite grammar.
//   * pgsql-ast-parser is a Postgres grammar (nearley + moo); we feed
//     it the same SQL and skip cases it can't handle.
//   * @guanmingchiu/sqlparser-ts wraps datafusion-sqlparser-rs in
//     WASM — same WASM boundary-crossing caveats as liteparser, plus
//     a JSON serialise/parse across the FFI.
//   * Ours is pure JS + generated tables from Lemon.
//   * We call `createLiteParser()` and `init()` once outside the hot
//     loop so WASM instantiation doesn't contaminate per-op numbers.
//   * TINY is small enough that fixed per-call overhead (WASM
//     boundary-crossings, module bootstrap for PEG parsers)
//     dominates.  Trust MEDIUM / LARGE / DEEP for throughput.

import { readFileSync } from "node:fs"
import { run, bench, group, summary, do_not_optimize } from "mitata"
import { DEEP, LARGE, MEDIUM, SMALL, TINY, parseAccepted as ourParse } from "./bench-common.ts"
// @ts-expect-error — no types shipped
import sqliteParser from "sqlite-parser"
// @ts-expect-error — no types shipped
import applandParse from "@appland/sql-parser"
// node-sql-parser ships CJS; Node's ESM interop only sees a default
// export.  Destructure to get the Parser class across both runtimes.
import nodeSqlParserModule from "node-sql-parser"
const { Parser: NodeSqlParser } = nodeSqlParserModule as unknown as {
  Parser: new () => { astify(sql: string, opts: { database: string }): unknown }
}
import { parse as pgAstParse } from "pgsql-ast-parser"
import { Parser as SqlParserTs, init as sqlParserTsInit } from "@guanmingchiu/sqlparser-ts"
import ourPkg from "../package.json" with { type: "json" }
import sqliteParserPkg from "sqlite-parser/package.json" with { type: "json" }
import applandPkg from "@appland/sql-parser/package.json" with { type: "json" }
import nodeSqlParserPkg from "node-sql-parser/package.json" with { type: "json" }
import pgsqlAstParserPkg from "pgsql-ast-parser/package.json" with { type: "json" }
import { runScript } from "./utils.ts"
import { printAggregateTable, printParserHeader, printReadmeSummaryTable } from "./bench-report.mjs"

// @guanmingchiu/sqlparser-ts's `exports` map doesn't expose
// `./package.json`, which Node enforces but Bun tolerates.  Read
// directly to keep both runtimes happy.
const sqlParserTsPkg = JSON.parse(
  readFileSync(
    new URL("../node_modules/@guanmingchiu/sqlparser-ts/package.json", import.meta.url),
    "utf8",
  ),
) as { name: string; version?: string; description?: string; homepage?: string }

// liteparser is bundled as a TypeScript ESM wrapper around WASM with
// `.js`-extension imports that Node's resolver can't rewrite.  Skip it
// under Node; include it only when running on Bun.  bench-compare gives
// useful numbers either way — liteparser just pins our "vs WASM" delta.
//
// The specifier is built at runtime (not a static string literal) so
// TypeScript doesn't statically resolve and typecheck the vendored
// submodule: `vendor/liteparser/wasm/src/liteparser.ts` carries an
// `@ts-expect-error` that TS 6 flags as unused, and we don't control
// that tree.  `exclude` in tsconfig doesn't cover files reached via
// import; `any`-typing the dynamic import does.
interface LiteParserHandle {
  parse(sql: string): unknown
  destroy(): void
}
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
const liteparserIndexUrl = "../vendor/liteparser/wasm/src/index" + ".ts"
const liteparser: LiteParserHandle | undefined = isBun
  ? await (
      (await import(liteparserIndexUrl)) as {
        createLiteParser(): Promise<LiteParserHandle>
      }
    ).createLiteParser()
  : undefined
const liteparserPkg = isBun
  ? ((await import("../vendor/liteparser/wasm/package.json", { with: { type: "json" } }))
      .default as PkgInfo)
  : undefined

await sqlParserTsInit()
const nodeSql = new NodeSqlParser()
const nodeSqlOpt = { database: "sqlite" } as const

// Each competitor: a label, an invoker, and the package metadata used
// for the markdown header.  `ours` must come first so it becomes the
// baseline row.  The sanity loop below also uses this list to skip
// (input × parser) combinations the parser can't handle — sqlite-parser
// (2015-2017) rejects window FILTER / newer grammar that the fork
// @appland/sql-parser picked up, and parsers targeting other dialects
// may refuse SQLite-isms; we show those as `—` rather than crashing
// the whole run.
interface PkgInfo {
  readonly name: string
  readonly version?: string
  readonly description?: string
  readonly homepage?: string
  readonly repository?: string | { readonly url?: string }
}
interface Competitor {
  readonly label: string
  readonly parse: (sql: string) => unknown
  readonly pkg: PkgInfo
}
const competitors: readonly Competitor[] = [
  { label: "ours", parse: (sql) => ourParse(sql), pkg: ourPkg },
  ...(liteparser && liteparserPkg
    ? [
        {
          label: "liteparser (wasm)",
          parse: (sql: string) => liteparser.parse(sql),
          pkg: liteparserPkg,
        },
      ]
    : []),
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

// Probe sanity once per (input, competitor) so we (a) fail loudly if
// *our* parser regresses and (b) omit inputs that individual
// competitors can't handle from the mitata runs.
const canHandle = new Map<string, Set<string>>()
function probe(label: string, sql: string): void {
  const ok = new Set<string>()
  for (const c of competitors) {
    try {
      c.parse(sql)
      ok.add(c.label)
    } catch (e) {
      if (c.label === "ours") throw e
      console.warn(`${label}: skipping ${c.label} (${(e as Error).message})`)
    }
  }
  canHandle.set(label, ok)
}

probe("tiny", TINY)
probe("small", SMALL)
probe("medium", MEDIUM)
probe("large (wide create table)", LARGE)
probe("deep (nested expr + subquery)", DEEP)

// Each group uses mitata's `summary` wrapper so it prints a
// "N.NNx faster/slower than <baseline>" line at the end.  We mark
// `ours` as the baseline so every comparison is "X relative to ours".
function groupFor(label: string, sql: string): void {
  const ok = canHandle.get(label) ?? new Set<string>()
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

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/bench-compare.ts [--filter <regex>] [--md]",
    options: {
      filter: { type: "string" },
      md: { type: "boolean" },
    },
  },
  async ({ values }) => {
    const filter = values.filter as string | undefined
    const md = Boolean(values.md)
    if (md) printParserHeader(competitors)

    // Capture mitata's per-line output via its `print` hook (src/main.mjs:318)
    // so we can emit a README-compatible summary table FIRST. Without the
    // reorder the summary lands below five per-input tables in the CI job
    // summary, defeating the copy-paste-into-README workflow.
    const captured: string[] = []
    const result = await run({
      ...(filter ? { filter: new RegExp(filter) } : {}),
      ...(md
        ? {
            format: "markdown" as const,
            colors: false,
            print: (s: string) => captured.push(s),
          }
        : {}),
    })

    if (md) {
      printReadmeSummaryTable(result.benchmarks)
      process.stdout.write("\n")
      for (const line of captured) process.stdout.write(line + "\n")
    }
    printAggregateTable(result.benchmarks, md)
  },
)

liteparser?.destroy()
