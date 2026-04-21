// scripts/utils.ts — shared plumbing for scripts/*.ts:
//
//   * project-root paths (REPO_ROOT, rootPath, rootRelativePath)
//   * cached package.json contents (PACKAGE_JSON)
//   * runScript(): a thin wrapper around node:util parseArgs with a
//     built-in --help/-h flag, usage formatter, CliUsageError handler,
//     and AggregateError sub-error reporting
//
// Keep this file import-only: no side effects, no top-level logging —
// scripts/*.ts import it transitively via scripts/vendor.ts's make
// dispatch, so noisy output here would leak into vendor flow.

import * as t from "typebox"
import * as s from "typebox/schema"
import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { parseArgs, ParseArgsOptionsConfig } from "node:util"
import type { ParseArgsConfig, ParseArgsOptionDescriptor } from "node:util"
type parseArgs = typeof parseArgs
type ParsedResult<T extends ParseArgsConfig> = ReturnType<typeof parseArgs<T>>

export const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")

export function rootPath(...subpaths: string[]): string {
  return resolve(REPO_ROOT, ...subpaths)
}

export function rootRelativePath(...subpaths: string[]): string {
  const path = rootPath(...subpaths)
  return relative(REPO_ROOT, path)
}

const PackageJsonSchema = s.Compile(
  t.Object({
    name: t.String(),
    version: t.String(),
  }),
)

export const PACKAGE_JSON_PATH = rootPath("package.json")

/**
 * Contents of the package.json file described in {@link PackageJsonSchema}.
 */
export const PACKAGE_JSON = PackageJsonSchema.Parse(
  JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")),
)

const defaultFlags = {
  help: {
    type: "boolean",
    short: "h",
  },
} as const satisfies ParseArgsOptionsConfig

function formatUsage(cfg: ParseArgsConfig & { usage: string }): string {
  const options = cfg.options ?? {}
  return [
    cfg.usage,
    "",
    "options:",
    ...Object.entries(options).map(([key, value]) => {
      return `  --${key}${value.short ? ` -${value.short}` : ""} ${value.type === "boolean" ? "" : `<value>`}`
    }),
  ].join("\n")
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CliUsageError"
  }
}

/**
 * CLI entry wrapper used by scripts/*.ts.  Parses argv via node:util's
 * parseArgs, injects a `--help/-h` flag, dispatches to `main`, and
 * surfaces AggregateError sub-errors.
 *
 * Positional args are always allowed — `main` receives `positionals` as
 * a `string[]`.  Throw {@link CliUsageError} from within `main` to
 * re-print usage and exit 2.
 */
export async function runScript<T extends ParseArgsConfig>(
  shouldRun: boolean,
  parseConfig: T & { usage: string },
  main: (
    args: ParsedResult<Omit<T, "allowPositionals"> & { allowPositionals: true }>,
  ) => void | Promise<void>,
): Promise<void> {
  if (!shouldRun) return

  const finalConfig = {
    ...parseConfig,
    allowPositionals: true as const,
    options: {
      ...defaultFlags,
      ...parseConfig.options,
    },
  }

  const args = parseArgs(finalConfig)
  if ((args.values as Record<string, unknown>).help) {
    console.log(formatUsage(finalConfig))
    return
  }

  try {
    await main(args as any)
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(err.message)
      console.error("")
      console.error(formatUsage(finalConfig))
      process.exit(2)
    }
    console.error(err)
    if (err && err instanceof AggregateError) {
      console.error(`Sub-errors:`)
      for (const inner of err.errors) {
        console.error(inner)
      }
    }
    process.exit(2)
  }
}
