// Micro-benchmarks for the tokenizer, parser, and error-formatting path.
//
// Run with `bun run bench` or `bun scripts/bench.ts`. Pass `--filter=<regex>`
// or `--filter <regex>` to restrict which benches run.
//
// Uses mitata; see https://github.com/evanwashere/mitata for options.

import { run, bench, group, do_not_optimize } from "mitata"
import {
  BENCH_CASES,
  BROKEN,
  MEDIUM,
  benchCaseLabel,
  parseAccepted,
  parseErrored,
  tokenize,
} from "./bench-common.ts"
import { lineColAt, renderCodeBlock } from "../src/diagnostics.ts"
import { runScript } from "./utils.ts"

function drainTokens(sql: string): number {
  let count = 0
  for (const _ of tokenize(sql)) count++
  return count
}

group("tokenize", () => {
  for (const [name, sql] of BENCH_CASES) {
    bench(benchCaseLabel(name, sql), () => do_not_optimize(drainTokens(sql)))
  }
})

group("parse", () => {
  for (const [name, sql] of BENCH_CASES) {
    bench(benchCaseLabel(name, sql), () => do_not_optimize(parseAccepted(sql)))
  }
})

group("error path", () => {
  bench("parse only", () => do_not_optimize(parseErrored(BROKEN)))
})

group("renderCodeBlock", () => {
  const commaPos = MEDIUM.indexOf(",")
  const start = lineColAt(MEDIUM, commaPos, undefined)
  const span = { offset: commaPos, length: 1, line: start.line, col: start.col }
  bench(`${benchCaseLabel("medium", MEDIUM)}, single-char span`, () =>
    do_not_optimize(renderCodeBlock({ source: MEDIUM }, span)))
})

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/bench.ts [--filter <regex>] [--md]",
    options: {
      filter: { type: "string" },
      md: { type: "boolean" },
    },
  },
  async ({ values }) => {
    const filter = values.filter as string | undefined
    const md = Boolean(values.md)
    await run({
      ...(filter ? { filter: new RegExp(filter) } : {}),
      ...(md ? { format: "markdown" as const, colors: false } : {}),
    })
  },
)
