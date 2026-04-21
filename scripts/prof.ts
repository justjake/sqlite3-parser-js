// `bun run prof` — capture a CPU profile of the parser hot loop.
//
// Spawns a child `bun --cpu-prof --cpu-prof-md … scripts/prof-run.ts`
// so the captured .cpuprofile / .md aren't cluttered with this
// orchestrator's spawn/IO frames.  Writes into a timestamped subdir
// under `tmp/prof/` (gitignored) and prints paths + a one-liner summary
// when it's done.
//
// Usage:
//   bun run prof                         # default: all inputs, 500µs sampling
//   bun run prof -- --filter=MEDIUM,DEEP # restrict to specific inputs
//   bun run prof -- --interval=250       # tighter sampling (smaller = more samples, more overhead)
//
// After the run, the .md file is the fastest way to scan hot functions;
// Chrome DevTools -> Performance -> Load Profile consumes the .cpuprofile
// for a flame graph.
//
// See PERF_IDEAS.md for what to actually do with the output and which
// subsystems the last profile surfaced as expensive.

import { mkdirSync, readdirSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

import { runScript } from "./utils.ts"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const PROF_DIR_ROOT = join(ROOT, "tmp", "prof")
const RUN_SCRIPT = join(ROOT, "scripts", "prof-run.ts")

function timestamp(): string {
  // ISO with filesystem-friendly separators: 2026-04-21T01-23-45
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-")
}

await runScript(
  import.meta.main,
  {
    usage:
      "usage: bun run prof [-- --filter=<labels>] [-- --interval=<µs>]\n" +
      "  labels: comma-separated subset of TINY,SMALL,MEDIUM,LARGE,DEEP\n" +
      "  interval: sampling interval in microseconds (default 500)",
    options: {
      filter: { type: "string" },
      interval: { type: "string" },
    },
  },
  ({ values }) => {
    const interval = values.interval ?? "500"
    const filter = values.filter as string | undefined

    const outDir = join(PROF_DIR_ROOT, timestamp())
    mkdirSync(outDir, { recursive: true })

    const runArgs = [
      "--cpu-prof",
      "--cpu-prof-md",
      `--cpu-prof-interval=${interval}`,
      `--cpu-prof-dir=${outDir}`,
      RUN_SCRIPT,
    ]
    if (filter) runArgs.push(`--filter=${filter}`)

    process.stderr.write(`→ bun ${runArgs.join(" ")}\n`)
    const r = spawnSync("bun", runArgs, { cwd: ROOT, stdio: "inherit" })
    if ((r.status ?? 1) !== 0) {
      process.exit(r.status ?? 1)
    }

    // Bun writes CPU.<epoch_ns>.<pid>.{cpuprofile,md}.  Surface them.
    const artifacts = existsSync(outDir) ? readdirSync(outDir).sort() : []
    const rel = (p: string) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p)
    process.stderr.write("\n")
    process.stderr.write(`profile written under ${rel(outDir)}/\n`)
    for (const f of artifacts) process.stderr.write(`  ${f}\n`)

    const md = artifacts.find((f) => f.endsWith(".md"))
    if (md) {
      process.stderr.write("\n")
      process.stderr.write(`quick-look:  less ${rel(join(outDir, md))}\n`)
      const cpuprofile = artifacts.find((f) => f.endsWith(".cpuprofile"))
      if (cpuprofile) {
        process.stderr.write(
          `flame graph: open Chrome DevTools → Performance → Load Profile → ${rel(join(outDir, cpuprofile))}\n`,
        )
      }
    }
  },
)
