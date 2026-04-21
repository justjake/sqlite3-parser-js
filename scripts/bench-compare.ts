// Comparative parse benchmarks: ours vs liteparser (WASM) vs @appland/sql-parser.
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
//   * Liteparser is C compiled to WASM with a JS marshalling layer that
//     walks the C AST and materialises JS objects via HEAPU32 reads.
//     The marshalling is not free and is part of what we're measuring.
//   * @appland/sql-parser is pure JS (CJS), no native/WASM component.
//   * Ours is pure JS + generated tables from Lemon.
//   * We call `createLiteParser()` once outside the hot loop so WASM
//     instantiation doesn't contaminate the per-op numbers.

import { run, bench, group, summary, do_not_optimize } from "mitata"
import { LARGE, MEDIUM, SMALL, TINY, parseAccepted as ourParse } from "./bench-common.ts"
import { createLiteParser } from "../vendor/liteparser/wasm/src/index.ts"
// @ts-expect-error — no types shipped
import applandParse from "@appland/sql-parser"
import { runScript } from "./utils.ts"

const liteparser = await createLiteParser()

// Sanity: fail fast if any parser can't handle an input.  Catches API
// regressions before we waste minutes warming mitata.
for (const [name, sql] of [
  ["TINY", TINY],
  ["SMALL", SMALL],
  ["MEDIUM", MEDIUM],
  ["LARGE", LARGE],
] as const) {
  ourParse(sql)
  liteparser.parse(sql)
  applandParse(sql)
  void name
}

// Each group uses mitata's `summary` wrapper so it prints a
// "N.NNx faster/slower than <baseline>" line at the end.  We mark
// `ours` as the baseline so every comparison is "X relative to ours".
function groupFor(label: string, sql: string): void {
  group(label, () => {
    summary(() => {
      bench(`${label} / ours`, () => do_not_optimize(ourParse(sql))).baseline(true)
      bench(`${label} / liteparser (wasm)`, () => do_not_optimize(liteparser.parse(sql)))
      bench(`${label} / @appland/sql-parser`, () => do_not_optimize(applandParse(sql)))
    })
  })
}

groupFor("tiny", TINY)
groupFor("small", SMALL)
groupFor("medium", MEDIUM)
groupFor("large (wide create table)", LARGE)

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
    const result = await run({
      ...(filter ? { filter: new RegExp(filter) } : {}),
      ...(md ? { format: "markdown" as const, colors: false } : {}),
    })
    printAggregateTable(result.benchmarks, md)
  },
)

liteparser.destroy()

// ---------------------------------------------------------------------------
// Per-group summaries from mitata are great for scanning, but readers
// comparing trends across input sizes want a single table.  This
// aggregator walks the `run()` trials, groups them by label prefix
// (`tiny`, `small`, `medium`, `large …`) and competitor suffix
// (`ours`, `liteparser (wasm)`, `@appland/sql-parser`), and prints an
// ASCII matrix with both absolute avg timings and ×-multiples relative
// to `ours`.
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

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

function padEnd(s: string, w: number): string {
  const visible = stripAnsi(s).length
  return visible >= w ? s : s + " ".repeat(w - visible)
}
