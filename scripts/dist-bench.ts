#!/usr/bin/env -S bun run
// scripts/dist-bench.ts — run the dist-test benches (bench.mjs /
// bench-compare.mjs) against the *published* shape of the package,
// under either Bun or Node.
//
// Setup that this script guarantees before invoking the target:
//   1. dist/ is built (runs build:dist if missing).
//   2. dist-test/node_modules/sqlite3-parser is a symlink to REPO_ROOT,
//      so the dist-test bench files resolve the package the way
//      consumers would — through node_modules — while reading the
//      repo's dist/ output.  CI installs the tarball instead; this
//      script just makes dev look the same.
//   3. dist-test's own devDependencies (mitata + competitor parsers)
//      are installed in dist-test/node_modules.  Uses the existing
//      lockfile if present; runs `npm install --no-package-lock` on
//      first setup.
//
// Usage:
//   bun scripts/dist-bench.ts <target> <runtime> [--filter <regex>] [--md]
//
// Where:
//   <target>  bench | bench-compare
//   <runtime> bun | node

import { existsSync, symlinkSync, lstatSync, mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

import { CliUsageError, REPO_ROOT, runScript } from "./utils.ts"

const DIST_TEST = join(REPO_ROOT, "dist-test")
const DIST_DIR = join(REPO_ROOT, "dist")

function run(cmd: string, args: string[], cwd: string): void {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" })
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.status ?? "?"}`)
  }
}

/** Ensure dist/ exists (triggers a build if not). */
function ensureDist(): void {
  if (existsSync(DIST_DIR)) return
  console.log("[dist-bench] dist/ missing; building…")
  run("bun", ["run", "build"], REPO_ROOT)
}

/**
 * Ensure dist-test/node_modules/sqlite3-parser points at REPO_ROOT so
 * `import "sqlite3-parser"` from dist-test resolves to the package's
 * `main` (dist/generated/current.js).
 */
function ensurePackageSymlink(): void {
  const modules = join(DIST_TEST, "node_modules")
  mkdirSync(modules, { recursive: true })
  const linkPath = join(modules, "sqlite3-parser")
  if (existsSync(linkPath)) {
    const stat = lstatSync(linkPath)
    if (stat.isSymbolicLink()) return
    // A real directory is sitting where the symlink should be (probably
    // from a prior `npm install <tarball>` run).  Replace it.
    console.log("[dist-bench] replacing dist-test/node_modules/sqlite3-parser with repo symlink…")
    run("rm", ["-rf", linkPath], REPO_ROOT)
  }
  symlinkSync(REPO_ROOT, linkPath, "dir")
}

/** Ensure dist-test's own devDependencies are installed. */
function ensureDistTestDeps(): void {
  const modules = join(DIST_TEST, "node_modules")
  // Presence of mitata is a good proxy for a completed install.
  if (existsSync(join(modules, "mitata"))) return
  console.log("[dist-bench] installing dist-test devDependencies…")
  // `npm install --no-package-lock` picks up devDependencies from
  // package.json without touching or creating a lockfile in dist-test/.
  // The sqlite3-parser symlink created above is preserved because npm
  // treats extraneous modules as untracked unless --prune is passed.
  run("npm", ["install", "--no-package-lock", "--no-save"], DIST_TEST)
  // npm install may have nuked the symlink while reconciling
  // node_modules.  Re-create it defensively.
  ensurePackageSymlink()
}

await runScript(
  import.meta.main,
  {
    usage:
      "usage: bun scripts/dist-bench.ts <bench|bench-compare> <bun|node> [--filter <regex>] [--md]",
    options: {
      filter: { type: "string" },
      md: { type: "boolean" },
    },
  },
  async ({ positionals, values }) => {
    const [target, runtime] = positionals
    if (target !== "bench" && target !== "bench-compare") {
      throw new CliUsageError(`bad <target>: ${target ?? "(missing)"}`)
    }
    if (runtime !== "bun" && runtime !== "node") {
      throw new CliUsageError(`bad <runtime>: ${runtime ?? "(missing)"}`)
    }

    ensureDist()
    ensurePackageSymlink()
    ensureDistTestDeps()

    const script = target === "bench" ? "bench.mjs" : "bench-compare.mjs"
    const args: string[] = []
    if (values.filter) args.push("--filter", String(values.filter))
    if (values.md) args.push("--md")

    console.log(`[dist-bench] ${runtime} ./${script} ${args.join(" ")}`.trimEnd())
    run(runtime, [`./${script}`, ...args], DIST_TEST)
  },
)
