// Micro-benchmarks for the tokenizer, parser, and error-formatting path.
//
// Run with `bun run bench` or `bun scripts/bench.ts`. Pass `--filter=<regex>`
// or `--filter <regex>` to restrict which benches run.
//
// Uses mitata; see https://github.com/evanwashere/mitata for options.

import { run, bench, group, do_not_optimize } from "mitata"
import {
  BROKEN,
  LARGE,
  MEDIUM,
  SMALL,
  TINY,
  parse,
  parseAccepted,
  parseErrored,
  tokenize,
} from "./bench-common.ts"
import { lineColAt, renderCodeBlock } from "../src/enhanceError.ts"
import { runScript } from "./utils.ts"

function drainTokens(sql: string): number {
  let count = 0
  for (const _ of tokenize(sql)) count++
  return count
}

group("tokenize", () => {
  bench("tiny", () => do_not_optimize(drainTokens(TINY)))
  bench("small", () => do_not_optimize(drainTokens(SMALL)))
  bench("medium", () => do_not_optimize(drainTokens(MEDIUM)))
  bench("large (wide create table)", () => do_not_optimize(drainTokens(LARGE)))
})

group("parse", () => {
  bench("tiny", () => do_not_optimize(parseAccepted(TINY)))
  bench("small", () => do_not_optimize(parseAccepted(SMALL)))
  bench("medium", () => do_not_optimize(parseAccepted(MEDIUM)))
  bench("large (wide create table)", () => do_not_optimize(parseAccepted(LARGE)))
})

group("error path", () => {
  bench("parse only", () => do_not_optimize(parseErrored(BROKEN)))
})

group("renderCodeBlock", () => {
  const commaPos = MEDIUM.indexOf(",")
  const start = lineColAt(MEDIUM, commaPos, undefined)
  const span = { offset: commaPos, length: 1, line: start.line, col: start.col }
  bench("medium, single-char span", () =>
    do_not_optimize(renderCodeBlock({ source: MEDIUM }, span)))
})

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/bench.ts [--filter <regex>]",
    options: { filter: { type: "string" } },
  },
  async ({ values }) => {
    const filter = values.filter as string | undefined
    await run(filter ? { filter: new RegExp(filter) } : {})
  },
)
