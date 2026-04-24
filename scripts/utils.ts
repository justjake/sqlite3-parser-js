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
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs, type ParseArgsOptionsConfig } from "node:util"
import type { ParseArgsConfig, ParseArgsOptionDescriptor } from "node:util"
type parseArgs = typeof parseArgs
type ParsedResult<T extends ParseArgsConfig> = ReturnType<typeof parseArgs<T>>

// `__BUNDLED__` is a build-time identifier stamped in by `Bun.build`
// via its `define:` option (see scripts/build.ts). In source it does
// not exist — `typeof` on an undeclared global returns "undefined"
// without throwing — so the check below works in both modes without
// a try/catch.
declare const __BUNDLED__: boolean

/**
 * True when the code was loaded from the source tree (developer
 * running CLIs / tests from a checkout). False when loaded from the
 * bundled package (`dist/` tree, published to npm).
 */
export function isRunningFromSource(): boolean {
  return typeof __BUNDLED__ === "undefined"
}

const SELF_DIR = dirname(fileURLToPath(import.meta.url))

// Source: scripts/utils.ts lives at `<root>/scripts/`, so the repo
// root is exactly one directory up — a fixed, known layout we control.
const SourcePathToRoot = resolve(SELF_DIR, "..")

// Bundled: this module's code is inlined by Bun's bundler into a
// chunk or CLI entry somewhere under `dist/`. The package root is
// wherever `package.json` sits above that. Walk up until we find it
// rather than guessing a fixed ascent count, because Bun's splitting
// can land the code at `dist/` (chunk), `dist/bin/` (inlined into a
// CLI entry), or elsewhere depending on what else imports it.
function findProdPathToRoot(): string {
  let dir = SELF_DIR
  while (true) {
    if (existsSync(join(dir, "package.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return SELF_DIR
    dir = parent
  }
}

export const REPO_ROOT = isRunningFromSource() ? SourcePathToRoot : findProdPathToRoot()

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

/**
 * Resolve a package-style import specifier (`<packageName>` or
 * `<packageName>/<subpath>`) to something a generated file at
 * {@link callerUrl} can import.
 *
 * - Bundled (published package): returns {@link spec} unchanged. The
 *   runtime / packager resolves it against installed node_modules.
 * - Source (in-repo checkout): walks the package's `exports` field to
 *   locate the built `./dist/...` target, maps that back to its
 *   authoring path under `./src/...` or `./generated/...`, and returns
 *   that path relative to {@link callerUrl}'s directory so it reads
 *   like a normal relative import. If the spec doesn't reference this
 *   package, doesn't map through `exports`, or the resolved source
 *   file doesn't exist, the spec is returned unchanged.
 *
 * The {@link callerUrl} is the `import.meta.url` (or any `file://` URL)
 * of the module that will *contain* the import — i.e. the file that
 * will see the returned string as an import specifier. For emit-time
 * code generation pass the output file's URL, not the generator's own.
 */
export function resolvePackageImport(spec: string, callerUrl: string): string {
  if (!isRunningFromSource()) return spec

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    readonly name?: string
    readonly exports?: Record<string, unknown>
  }
  const pkgName = pkg.name
  const exports = pkg.exports
  if (!pkgName || !exports) return spec
  if (spec !== pkgName && !spec.startsWith(`${pkgName}/`)) return spec

  const subpath = spec === pkgName ? "." : `./${spec.slice(pkgName.length + 1)}`
  const distPath = resolveExportSubpath(exports, subpath)
  if (!distPath) return spec
  const sourcePath = distPathToSource(distPath)
  if (!sourcePath) return spec

  const abs = rootPath(sourcePath)
  if (!existsSync(abs)) return spec

  const callerDir = dirname(fileURLToPath(new URL(callerUrl)))
  let rel = relative(callerDir, abs)
  if (!rel.startsWith(".")) rel = `./${rel}`
  return rel
}

// Walk `exports` for a subpath. Handles exact matches and simple
// single-`*` wildcard patterns (e.g. `./sqlite-*`).
function resolveExportSubpath(
  exports: Record<string, unknown>,
  subpath: string,
): string | undefined {
  const exact = exports[subpath]
  if (exact !== undefined) return exportEntryDefault(exact)
  for (const [pattern, entry] of Object.entries(exports)) {
    const starIdx = pattern.indexOf("*")
    if (starIdx < 0) continue
    const prefix = pattern.slice(0, starIdx)
    const suffix = pattern.slice(starIdx + 1)
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue
    const star = subpath.slice(prefix.length, subpath.length - suffix.length)
    const entryDefault = exportEntryDefault(entry)
    if (entryDefault !== undefined) return entryDefault.replace("*", star)
  }
  return undefined
}

function exportEntryDefault(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry
  if (entry && typeof entry === "object") {
    const obj = entry as Record<string, unknown>
    const cand = obj["default"] ?? obj["import"]
    if (typeof cand === "string") return cand
  }
  return undefined
}

// Package `exports` point at the built `./dist/...` layout, which
// mirrors the source tree under `dist/`. Stripping the `./dist/`
// prefix and swapping `.js` for `.ts` recovers the authoring path.
function distPathToSource(distPath: string): string | undefined {
  if (!distPath.startsWith("./dist/")) return undefined
  return distPath.replace(/^\.\/dist\//, "./").replace(/\.js$/, ".ts")
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
