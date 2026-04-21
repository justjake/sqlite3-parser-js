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

import { run, bench, group, do_not_optimize } from "mitata"
import {
  LARGE,
  MEDIUM,
  SMALL,
  TINY,
  parseAccepted as ourParse,
} from "./bench-common.ts"
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

function groupFor(label: string, sql: string): void {
  group(label, () => {
    bench(`${label} / ours`, () => do_not_optimize(ourParse(sql)))
    bench(`${label} / liteparser (wasm)`, () => do_not_optimize(liteparser.parse(sql)))
    bench(`${label} / @appland/sql-parser`, () => do_not_optimize(applandParse(sql)))
  })
}

groupFor("tiny", TINY)
groupFor("small", SMALL)
groupFor("medium", MEDIUM)
groupFor("large (wide create table)", LARGE)

await runScript(
  import.meta.main,
  {
    usage: "usage: bun scripts/bench-compare.ts [--filter <regex>]",
    options: { filter: { type: "string" } },
  },
  async ({ values }) => {
    const filter = values.filter as string | undefined
    await run(filter ? { filter: new RegExp(filter) } : {})
  },
)

liteparser.destroy()
