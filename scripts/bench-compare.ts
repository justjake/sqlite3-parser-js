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
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"
const liteparser = isBun
  ? await (await import("../vendor/liteparser/wasm/src/index.ts")).createLiteParser()
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

// ---------------------------------------------------------------------------
// Per-group summaries from mitata are great for scanning, but readers
// comparing trends across input sizes want a single table.  This
// aggregator walks the `run()` trials, groups them by label prefix
// (`tiny`, `small`, `medium`, `large …`, `deep …`) and competitor
// suffix (`ours`, `liteparser (wasm)`, `sqlite-parser`,
// `@appland/sql-parser`), and prints an ASCII matrix with both
// absolute avg timings and ×-multiples relative to `ours`.
// ---------------------------------------------------------------------------

interface Trial {
  alias: string
  runs: readonly { stats?: { avg: number } | undefined }[]
}

function printAggregateTable(benchmarks: readonly Trial[], md = false): void {
  // `alias` looks like `<label> / <competitor>`.  Split on the last
  // " / " so labels containing slashes (none today, but cheap to
  // support) survive.
  const trials = benchmarks
    .map((t) => {
      const idx = t.alias.lastIndexOf(" / ")
      if (idx < 0) return undefined
      const avg = t.runs[0]?.stats?.avg
      if (avg === undefined) return undefined
      return { label: t.alias.slice(0, idx), competitor: t.alias.slice(idx + 3), avg }
    })
    .filter((t): t is { label: string; competitor: string; avg: number } => t !== undefined)

  if (trials.length === 0) return

  const labels = [...new Set(trials.map((t) => t.label))]
  const competitors = [...new Set(trials.map((t) => t.competitor))]
  const byKey = new Map<string, number>()
  for (const t of trials) byKey.set(`${t.label}\0${t.competitor}`, t.avg)

  const BASELINE = "ours"
  const cols: Array<{ header: string; cell: (label: string) => string }> = [
    { header: "input", cell: (l) => l },
  ]
  for (const c of competitors) {
    cols.push({ header: c, cell: (l) => formatAvg(byKey.get(`${l}\0${c}`)) })
    if (c !== BASELINE) {
      cols.push({ header: `vs ${BASELINE}`, cell: (l) => formatRatio(byKey, l, c, BASELINE) })
    }
  }

  const print = (s: string): void => {
    process.stdout.write(s + "\n")
  }

  print("")
  if (md) {
    print("### aggregate (avg / iter)")
    print("")
    print("| " + cols.map((c) => c.header).join(" | ") + " |")
    print("| " + cols.map(() => "---").join(" | ") + " |")
    for (const l of labels) {
      print("| " + cols.map((c) => c.cell(l)).join(" | ") + " |")
    }
    return
  }

  const widths = cols.map((c) =>
    Math.max(c.header.length, ...labels.map((l) => stripAnsi(c.cell(l)).length)),
  )
  const rule = widths.map((w) => "─".repeat(w)).join("─┼─")
  const join = (parts: readonly string[]): string =>
    parts.map((p, i) => padEnd(p, widths[i]!)).join(" │ ")

  print("aggregate (avg / iter)")
  print(join(cols.map((c) => c.header)))
  print(rule)
  for (const l of labels) print(join(cols.map((c) => c.cell(l))))
}

/**
 * Emit a markdown table matching the `### Results` block in README.md:
 * rows are parsers, columns are inputs, each non-baseline cell carries
 * a `(N.N×)` slowdown factor relative to ours.  Intended as a
 * copy-paste-into-README summary at the top of `bench-compare --md`.
 */
function printReadmeSummaryTable(benchmarks: readonly Trial[]): void {
  const trials = benchmarks
    .map((t) => {
      const idx = t.alias.lastIndexOf(" / ")
      if (idx < 0) return undefined
      const avg = t.runs[0]?.stats?.avg
      if (avg === undefined) return undefined
      return { label: t.alias.slice(0, idx), competitor: t.alias.slice(idx + 3), avg }
    })
    .filter((t): t is { label: string; competitor: string; avg: number } => t !== undefined)
  if (trials.length === 0) return

  const labels = [...new Set(trials.map((t) => t.label))]
  const byKey = new Map<string, number>()
  for (const t of trials) byKey.set(`${t.label}\0${t.competitor}`, t.avg)

  const BASELINE = "ours"

  // Order competitors the way the README does: baseline first, then
  // the rest sorted by geometric mean of avg-time across inputs so the
  // fastest-next-to-ours lands near the top. Geometric mean because
  // sizes span four orders of magnitude (ns to ms) and an arithmetic
  // mean would be dominated by LARGE/MEDIUM.
  const allCompetitors = [...new Set(trials.map((t) => t.competitor))]
  const geomean = (c: string): number => {
    let log = 0
    let n = 0
    for (const l of labels) {
      const v = byKey.get(`${l}\0${c}`)
      if (v !== undefined && v > 0) {
        log += Math.log(v)
        n++
      }
    }
    return n === 0 ? Infinity : Math.exp(log / n)
  }
  const competitors = [
    ...(allCompetitors.includes(BASELINE) ? [BASELINE] : []),
    ...allCompetitors.filter((c) => c !== BASELINE).sort((a, b) => geomean(a) - geomean(b)),
  ]

  const print = (s: string): void => {
    process.stdout.write(s + "\n")
  }
  // README uses the short label (strip `" (..."` qualifier on LARGE / DEEP).
  const shortInput = (l: string): string => l.split(" (")[0]!
  const parserDisplay = (c: string): string => (c === BASELINE ? "Ours" : `\`${c}\``)

  // Pre-index "ours" timings so the ratio lookup is O(1).
  const oursByLabel = new Map<string, number>()
  for (const l of labels) {
    const a = byKey.get(`${l}\0${BASELINE}`)
    if (a !== undefined) oursByLabel.set(l, a)
  }

  // Build rows as string arrays first so we can pad to matching column
  // widths — the README's table is pre-formatted and readers expect the
  // copy-pasted block to land lined up.
  const header = ["Parser", ...labels.map((l) => `\`${shortInput(l)}\``)]
  const rows: string[][] = [header]
  for (const c of competitors) {
    const row: string[] = [parserDisplay(c)]
    for (const l of labels) {
      const avg = byKey.get(`${l}\0${c}`)
      if (avg === undefined) {
        row.push("—")
        continue
      }
      const base = oursByLabel.get(l)
      if (c === BASELINE || base === undefined) {
        row.push(`\`${formatAvgReadme(avg)}\``)
      } else {
        row.push(`\`${formatAvgReadme(avg)}\` (${formatRatioShort(avg / base)})`)
      }
    }
    rows.push(row)
  }

  const widths = header.map((_, col) => Math.max(...rows.map((r) => r[col]!.length)))
  const padCell = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length))
  const formatRow = (r: readonly string[]): string =>
    "| " + r.map((cell, i) => padCell(cell, widths[i]!)).join(" | ") + " |"

  print("### Results (README-compatible summary)")
  print("")
  print(
    "Avg per-iteration parse time across the five inputs. Parentheticals show the slowdown factor vs ours (lower = closer to ours; ours is the baseline so it has no parenthetical).",
  )
  print("")
  print(formatRow(header))
  print("| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |")
  for (const r of rows.slice(1)) print(formatRow(r))
}

/** `(1.47×)` / `(12×)` / `(559×)`. Matches the README's parenthetical style. */
function formatRatioShort(r: number): string {
  if (r >= 10) return `${Math.round(r)}×`
  return `${r.toFixed(1)}×`
}

/**
 * Like {@link formatAvg} but always uses µs/ms/s (no ns) and always two
 * decimal places. Matches the README's `### Results` table convention
 * so the summary is a drop-in paste.
 */
function formatAvgReadme(avg: number): string {
  if (avg < 1_000_000) return `${(avg / 1_000).toFixed(2)} µs`
  if (avg < 1_000_000_000) return `${(avg / 1_000_000).toFixed(2)} ms`
  return `${(avg / 1_000_000_000).toFixed(2)} s`
}

function formatAvg(avg: number | undefined): string {
  if (avg === undefined) return "—"
  if (avg < 1_000) return `${avg.toFixed(1)} ns`
  if (avg < 1_000_000) return `${(avg / 1_000).toFixed(2)} µs`
  if (avg < 1_000_000_000) return `${(avg / 1_000_000).toFixed(2)} ms`
  return `${(avg / 1_000_000_000).toFixed(2)} s`
}

function formatRatio(
  byKey: Map<string, number>,
  label: string,
  competitor: string,
  baseline: string,
): string {
  const a = byKey.get(`${label}\0${competitor}`)
  const b = byKey.get(`${label}\0${baseline}`)
  if (a === undefined || b === undefined) return "—"
  if (a >= b) return `${(a / b).toFixed(2)}× slower`
  return `${(b / a).toFixed(2)}× faster`
}

function printParserHeader(parsers: readonly Competitor[]): void {
  const print = (s: string): void => {
    process.stdout.write(s + "\n")
  }
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

function packageLink(pkg: PkgInfo): string | undefined {
  if (pkg.homepage) return pkg.homepage
  const repo = pkg.repository
  if (!repo) return undefined
  const raw = typeof repo === "string" ? repo : repo.url
  if (!raw) return undefined
  return normalizeRepoUrl(raw)
}

function normalizeRepoUrl(raw: string): string {
  let url = raw.replace(/^git\+/, "").replace(/\.git$/, "")
  const sshMatch = url.match(/^git@([^:]+):(.+)$/)
  if (sshMatch) url = `https://${sshMatch[1]}/${sshMatch[2]}`
  return url
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

function padEnd(s: string, w: number): string {
  const visible = stripAnsi(s).length
  return visible >= w ? s : s + " ".repeat(w - visible)
}
