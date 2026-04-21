// The inner body of a CPU-profiled parser run.  Launched by
// `scripts/prof.ts`, which wraps this module with the appropriate
// `bun --cpu-prof` flags so the sampler captures its hot loop.
//
// Kept a separate file (rather than branched inside prof.ts) so the
// profile itself doesn't contain the orchestrator's spawn/IO frames.
//
// Workload: five pre-warmed hot loops, one per input size, chosen so
// each runs ~1-3s wall time at current baseline perf.  That balances
// samples across input shapes — tiny, a minimal SELECT; small, a
// moderate CREATE TABLE; medium / large, wide columns and common
// OLTP-shaped selects; deep, heavily nested expressions / subqueries
// that exercise the LR stack.
//
// The loops use `do_not_optimize`-free plain function calls so the
// generated profile attributes directly to parser internals.  Any
// output on stderr shows up in the orchestrator's console; the .cpuprofile
// / .md files are written by Bun's sampler automatically on exit.

import { DEEP, LARGE, MEDIUM, SMALL, TINY, parseAccepted as ourParse } from "./bench-common.ts"
import { runScript } from "./utils.ts"

interface Plan {
  readonly sql: string
  readonly iters: number
  readonly label: string
}

const PLANS: readonly Plan[] = [
  { sql: TINY, iters: 1_000_000, label: "TINY" },
  { sql: SMALL, iters: 500_000, label: "SMALL" },
  { sql: MEDIUM, iters: 100_000, label: "MEDIUM" },
  { sql: LARGE, iters: 40_000, label: "LARGE" },
  { sql: DEEP, iters: 200_000, label: "DEEP" },
]

/**
 * Warm each hot path so the JIT has compiled and inlined before the
 * sampler starts attributing time.  Without warmup the first ~5% of
 * samples land in baseline-tier / interpreter frames that don't
 * correspond to steady-state behavior.
 */
function warmup(): void {
  for (const { sql } of PLANS) {
    for (let i = 0; i < 1000; i++) ourParse(sql)
  }
}

function runPlan(plan: Plan): void {
  const start = performance.now()
  for (let i = 0; i < plan.iters; i++) ourParse(plan.sql)
  const elapsed = performance.now() - start
  process.stderr.write(`${plan.label}: ${plan.iters} iters in ${elapsed.toFixed(0)} ms\n`)
}

await runScript(
  import.meta.main,
  {
    usage:
      "usage: bun scripts/prof-run.ts [--filter <label,label,…>]\n" +
      "  (normally invoked via `bun run prof` — see scripts/prof.ts)",
    options: { filter: { type: "string" } },
  },
  ({ values }) => {
    const filter = values.filter as string | undefined
    const keep = filter ? new Set(filter.split(",").map((s) => s.trim().toUpperCase())) : undefined
    const plans = keep ? PLANS.filter((p) => keep.has(p.label)) : PLANS
    if (plans.length === 0) {
      process.stderr.write(`no plans matched filter ${JSON.stringify(filter)}\n`)
      process.exit(2)
    }
    warmup()
    for (const plan of plans) runPlan(plan)
  },
)
