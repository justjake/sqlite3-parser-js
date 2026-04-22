// `bun run prof` — capture a CPU profile of the parser hot loop.
//
// Spawns a child `bun --cpu-prof --cpu-prof-md … scripts/prof-run.ts`
// (or `node --cpu-prof --experimental-transform-types …` when
// `--runtime=node`) so the captured .cpuprofile / .md aren't cluttered
// with this orchestrator's spawn/IO frames.  Writes into a timestamped
// subdir under `tmp/prof/` (gitignored) and prints paths + a one-liner
// summary when it's done.
//
// Usage:
//   bun run prof                         # default: bun runtime, all inputs, 500µs sampling
//   bun run prof -- --filter=MEDIUM,DEEP # restrict to specific inputs
//   bun run prof -- --interval=250       # tighter sampling (smaller = more samples, more overhead)
//   bun run prof:node                    # profile under Node (V8 sampler); no .md report
//
// After the run, the .md file (Bun only) is the fastest way to scan hot
// functions; Chrome DevTools -> Performance -> Load Profile consumes the
// .cpuprofile for a flame graph under either runtime.
//
// See PERF_IDEAS.md for what to actually do with the output and which
// subsystems the last profile surfaced as expensive.

import { mkdirSync, readdirSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

import { CliUsageError, runScript } from "./utils.ts"

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
      "usage: bun run prof [-- --runtime=<bun|node>] [-- --filter=<labels>] [-- --interval=<µs>]\n" +
      "  runtime: bun (default) or node — node emits .cpuprofile only, no .md summary\n" +
      "  labels: comma-separated subset of TINY,SMALL,MEDIUM,LARGE,DEEP\n" +
      "  interval: sampling interval in microseconds (default 500)",
    options: {
      filter: { type: "string" },
      interval: { type: "string" },
      runtime: { type: "string" },
    },
  },
  ({ values }) => {
    const interval = values.interval ?? "500"
    const filter = values.filter as string | undefined
    const runtime = (values.runtime ?? "bun") as string
    if (runtime !== "bun" && runtime !== "node") {
      throw new CliUsageError(`--runtime must be bun or node, got ${runtime}`)
    }

    const outDir = join(PROF_DIR_ROOT, `${timestamp()}-${runtime}`)
    mkdirSync(outDir, { recursive: true })

    // Bun supports `--cpu-prof-md` for a markdown summary; Node doesn't.
    // Interval / dir flags are common to both.
    const runArgs =
      runtime === "bun"
        ? [
            "--cpu-prof",
            "--cpu-prof-md",
            `--cpu-prof-interval=${interval}`,
            `--cpu-prof-dir=${outDir}`,
            RUN_SCRIPT,
          ]
        : [
            "--experimental-transform-types",
            "--disable-warning=ExperimentalWarning",
            "--cpu-prof",
            `--cpu-prof-interval=${interval}`,
            `--cpu-prof-dir=${outDir}`,
            RUN_SCRIPT,
          ]
    if (filter) runArgs.push(`--filter=${filter}`)

    process.stderr.write(`→ ${runtime} ${runArgs.join(" ")}\n`)
    const r = spawnSync(runtime, runArgs, { cwd: ROOT, stdio: "inherit" })
    if ((r.status ?? 1) !== 0) {
      process.exit(r.status ?? 1)
    }

    // Bun writes CPU.<epoch_ns>.<pid>.{cpuprofile,md}; Node writes only
    // the .cpuprofile.  For Node, post-process the profile through
    // scripts/prof-report.ts so both runtimes land with a .md sidecar.
    let artifacts = existsSync(outDir) ? readdirSync(outDir).sort() : []
    if (runtime === "node") {
      const cpuprofile = artifacts.find((f) => f.endsWith(".cpuprofile"))
      if (cpuprofile) {
        const mdPath = join(outDir, cpuprofile.replace(/\.cpuprofile$/, ".md"))
        const report = spawnSync(
          "bun",
          [join(ROOT, "scripts", "prof-report.ts"), join(outDir, cpuprofile), "--out", mdPath],
          { cwd: ROOT, stdio: "inherit" },
        )
        if ((report.status ?? 1) !== 0) {
          process.stderr.write("warning: prof-report.ts failed; .cpuprofile is still available\n")
        }
        artifacts = readdirSync(outDir).sort()
      }
    }

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
