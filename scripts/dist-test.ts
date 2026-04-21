#!/usr/bin/env -S bun run

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { CliUsageError, PACKAGE_JSON, REPO_ROOT, runScript } from "./utils.ts"

const DIST_TEST = join(REPO_ROOT, "dist-test")

function run(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`)
  }
}

function stageTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "sqlite3-parser-dist-test-"))
  mkdirSync(join(tempDir, "node_modules"), { recursive: true })
  cpSync(join(DIST_TEST, "package.json"), join(tempDir, "package.json"))
  cpSync(join(DIST_TEST, "smoke.mjs"), join(tempDir, "smoke.mjs"))
  cpSync(join(DIST_TEST, "require-smoke.cjs"), join(tempDir, "require-smoke.cjs"))
  symlinkSync(REPO_ROOT, join(tempDir, "node_modules", PACKAGE_JSON.name), "dir")
  return tempDir
}

await runScript(
  import.meta.main,
  {
    usage: "usage: bun dist-test [--build]",
    options: {
      build: {
        type: "boolean",
      },
    },
  },
  async ({ values }) => {
    if (values.build) {
      run("bun", ["run", "build:bundle"], REPO_ROOT)
    } else if (!existsSync(join(REPO_ROOT, "dist"))) {
      throw new CliUsageError(
        "dist/ is missing. Run `bun dist-test --build` or `bun run build:bundle` first.",
      )
    }

    const tempDir = stageTempDir()
    try {
      run("node", ["--test", "./smoke.mjs"], tempDir)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  },
)
