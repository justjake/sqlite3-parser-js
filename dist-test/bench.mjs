// Dist-test micro-benchmarks: exercise the published `sqlite3-parser`
// package entry point (not source files) so we catch bundling,
// exports-map, or runtime-compat regressions in the shipped artifact.
// Runs under Bun or Node; see scripts/dist-bench.ts for the wrapper.

import { parseArgs } from "node:util"
import { run, bench, group, do_not_optimize } from "mitata"
import { parse, tokenize, lineColAt, renderCodeBlock } from "sqlite3-parser"
import { BROKEN, LARGE, MEDIUM, SMALL, TINY } from "./bench-fixtures.mjs"

function drainTokens(sql) {
  let count = 0
  for (const _ of tokenize(sql)) count++
  return count
}

function parseAccepted(sql) {
  const result = parse(sql)
  if (result.status !== "ok") {
    throw new Error(`expected parse success for ${JSON.stringify(sql.slice(0, 40))}…`)
  }
  return result
}

function parseErrored(sql) {
  const result = parse(sql)
  if (result.status !== "error") throw new Error("expected parse error")
  return result.errors
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

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    filter: { type: "string" },
    md: { type: "boolean" },
  },
  strict: false,
})

await run({
  ...(values.filter ? { filter: new RegExp(values.filter) } : {}),
  ...(values.md ? { format: "markdown", colors: false } : {}),
})
