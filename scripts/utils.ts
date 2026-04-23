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
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { parseArgs, type ParseArgsOptionsConfig } from "node:util"
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

export interface CliInput {
  readonly source: string
  readonly filename: string | undefined
}

/** Drain process.stdin to a UTF-8 string. */
export async function readStdin(): Promise<string> {
  let data = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) data += chunk
  return data
}

/**
 * Resolve CLI positional args into `{ source, filename }` for any bin/*
 * that consumes a single blob of text (SQL, a sqllogictest script, …):
 *
 * - `"-"` as the sole positional → read stdin, filename `/dev/stdin`.
 * - A single positional that names an existing regular file → read that
 *   file, filename is the path.  The arg must plausibly look like a path
 *   (short, no newlines / null bytes) before we stat it, so SQL
 *   containing the word `SELECT` doesn't accidentally hit the disk.
 * - Otherwise → `positionals.join(" ")`, filename `undefined`.
 * - No positionals + non-TTY stdin → read stdin, filename `/dev/stdin`.
 * - No positionals + TTY stdin → throw {@link CliUsageError}.
 */
export async function resolveCliInput(positionals: readonly string[]): Promise<CliInput> {
  const first = positionals[0]
  if (first === "-") {
    return { source: await readStdin(), filename: "/dev/stdin" }
  }
  if (
    positionals.length === 1 &&
    first !== undefined &&
    looksLikeFilename(first) &&
    existsSync(first) &&
    statSync(first).isFile()
  ) {
    return { source: readFileSync(first, "utf8"), filename: first }
  }
  if (positionals.length === 0) {
    if (!process.stdin.isTTY) {
      return { source: await readStdin(), filename: "/dev/stdin" }
    }
    throw new CliUsageError("missing input: pass inline text, a file path, or '-' to read stdin")
  }
  return { source: positionals.join(" "), filename: undefined }
}

function looksLikeFilename(s: string): boolean {
  if (s.length === 0 || s.length > 4096) return false
  return !/[\n\r\0]/.test(s)
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
