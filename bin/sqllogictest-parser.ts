#!/usr/bin/env bun
// sqllogictest-parser — developer CLI for parsing a sqllogictest `.test`
// script and dumping the record list (or user-facing error diagnostics)
// to stdout. Handy for poking at format edge cases without writing a
// throwaway script.
//
//   sqllogictest-parser script.test
//   sqllogictest-parser - < script.test
//   cat script.test | sqllogictest-parser
//   sqllogictest-parser --ts --ts-imports ./harness.ts script.test > out.test.ts
//
// Not a production interface — reach for the library API
// (`import { parseTest } from 'sqlite3-parser/sqllogictest'`) in real
// code. Errors do not abort parsing: diagnostics are printed to stderr
// and the record list is still emitted on stdout, but the process exits
// non-zero if any diagnostic was produced.
//
// With --ts the CLI delegates to `emitTsTestModule` (in
// src/sqllogictest/ts-test-emitter.ts) to produce a bun:test test
// module. The CLI's own job in that path is resolving the user-facing
// specifiers: `--ts-imports` as a file-or-literal, `--ts-driver` as a
// `<Name>:<specifier>` pair, and rewriting a `<packageName>/…` driver
// specifier to a source-tree path when running from a checkout.

import { existsSync, readFileSync, statSync } from "node:fs"

import { parseTest } from "../src/sqllogictest/testparser.ts"
import { shouldSkipForDbname } from "../src/sqllogictest/drivers.ts"
import type { TestRecord } from "../src/sqllogictest/nodes.ts"
import { emitTsTestModule, type TsTestDriverImport } from "../src/sqllogictest/ts-test-emitter.ts"
import {
  CliUsageError,
  PACKAGE_JSON_PATH,
  resolveCliInput,
  rootPath,
  runScript,
} from "../scripts/utils.ts"

const DEFAULT_TS_RUNNER = "bun:test"
const DEFAULT_TS_DRIVER = "SQLite3ParserTestDriver:sqlite3-parser/sqllogictest"

// Full package.json — used to rewrite `<name>/<subpath>` driver
// specifiers through the `exports` field when we're running from
// source. `scripts/utils.ts` only surfaces `name` / `version` from its
// validated view, so we re-read the file here to see the whole shape.
const RAW_PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
  readonly name?: string
  readonly exports?: Record<string, unknown>
}

await runScript(
  import.meta.main,
  {
    usage:
      "usage: sqllogictest-parser [options] [<input>]\n" +
      "  --emit-trivia          Keep `#` comments and blank-line runs as nodes.\n" +
      "  --sql                  Emit just the SQL bodies of statement / query\n" +
      "                         records, each terminated by `;`. Mutually\n" +
      "                         exclusive with --ts.\n" +
      "  --ts                   Emit a bun:test test module instead of JSON.\n" +
      "  --ts-imports <str>     TS code or path to a file, inlined into the import\n" +
      "                         zone of the --ts output.\n" +
      "  --ts-runner <str>      Module that exports { describe, test, expect,\n" +
      "                         beforeEach, afterEach }. Default: bun:test.\n" +
      "  --ts-driver <str>      Driver import for the emitted tests, in the form\n" +
      "                         `<ImportName>:<specifier>` for a named import or\n" +
      "                         just `<specifier>` for a namespace import. The\n" +
      "                         driver must expose `.setup({ describe, test,\n" +
      "                         expect, beforeEach, afterEach })` returning an\n" +
      "                         object with `.runRecord(record)`. Default:\n" +
      "                         SQLite3ParserTestDriver:sqlite3-parser/sqllogictest.\n" +
      "                         When running from source, a `<package-name>/...`\n" +
      "                         specifier is rewritten via package.json `exports`\n" +
      "                         so the emitted tests resolve to the source tree.\n" +
      "  --skip-if-dbname <db>  Set the runner's database name. Records whose\n" +
      "                         skipif/onlyif modifiers would skip for that name\n" +
      "                         are omitted from JSON output, or emitted as\n" +
      "                         test.skip under --ts.\n" +
      "  --idx <N>[:<M>]        Emit only the Nth statement/query record, or the\n" +
      "                         inclusive range N..M. Numbering is 1-based and\n" +
      "                         matches the `#N` labels in --ts output; trivia\n" +
      "                         and control records are always skipped.\n" +
      "  <input>                sqllogictest source, a path to a `.test` file, or\n" +
      "                         '-' for stdin.",
    options: {
      "emit-trivia": { type: "boolean" },
      sql: { type: "boolean" },
      ts: { type: "boolean" },
      "ts-imports": { type: "string" },
      "ts-runner": { type: "string", default: DEFAULT_TS_RUNNER },
      "ts-driver": { type: "string", default: DEFAULT_TS_DRIVER },
      "skip-if-dbname": { type: "string" },
      idx: { type: "string" },
    },
  },
  async ({ values, positionals }) => {
    const emitTrivia = Boolean(values["emit-trivia"])
    const sqlMode = Boolean(values["sql"])
    const tsMode = Boolean(values["ts"])
    if (sqlMode && tsMode) {
      throw new CliUsageError("--sql and --ts are mutually exclusive")
    }
    const dbname = values["skip-if-dbname"]
    const idxRange = parseIdxRange(values["idx"])
    const tsRunner = values["ts-runner"] ?? DEFAULT_TS_RUNNER
    const tsImports = resolveTsImports(values["ts-imports"])
    const tsDriver = resolveTsDriver(values["ts-driver"] ?? DEFAULT_TS_DRIVER)

    const { source, filename } = await resolveCliInput(positionals)
    const result = parseTest({
      source,
      filename: filename ?? "<inline>",
      emitTrivia,
    })

    for (const err of result.errors) console.error(err.format())

    const records = idxRange ? sliceByIndex(result.records, idxRange) : result.records

    if (tsMode) {
      console.log(
        emitTsTestModule(records, {
          title: result.filename,
          runner: tsRunner,
          driver: tsDriver,
          imports: tsImports,
          dbname,
          startIndex: idxRange?.lo,
        }),
      )
    } else if (sqlMode) {
      const bodies: string[] = []
      for (const rec of records) {
        if (rec.type !== "statement" && rec.type !== "query") continue
        if (dbname !== undefined && shouldSkipForDbname(rec, dbname)) continue
        bodies.push(`${rec.sql};`)
      }
      console.log(bodies.join("\n"))
    } else {
      const filtered =
        dbname !== undefined ? records.filter((r) => !shouldSkipForDbname(r, dbname)) : records
      console.log(JSON.stringify(filtered, undefined, 2))
    }

    if (result.errors.length > 0) process.exit(1)
  },
)

interface IdxRange {
  readonly lo: number
  readonly hi: number
}

// Accept `<N>` (single record) or `<N>:<M>` (inclusive range).
function parseIdxRange(raw: string | undefined): IdxRange | undefined {
  if (raw === undefined) return undefined
  const m = /^(\d+)(?::(\d+))?$/.exec(raw)
  if (!m) throw new CliUsageError(`invalid --idx: ${raw} (expected N or N:M)`)
  const lo = Number(m[1])
  const hi = m[2] !== undefined ? Number(m[2]) : lo
  if (lo < 1 || hi < lo) throw new CliUsageError(`invalid --idx range: ${raw}`)
  return { lo, hi }
}

// Keep only statement / query records whose 1-based ordinal falls
// inside `range`. Trivia and control records are dropped entirely, so
// the result is a flat list of the requested SQL-bearing records.
function sliceByIndex(records: readonly TestRecord[], range: IdxRange): readonly TestRecord[] {
  const out: TestRecord[] = []
  let ordinal = 0
  for (const rec of records) {
    if (rec.type !== "statement" && rec.type !== "query") continue
    ordinal++
    if (ordinal < range.lo) continue
    if (ordinal > range.hi) break
    out.push(rec)
  }
  return out
}

// --ts-imports can be inline TS text or a path to a file whose contents
// are inlined verbatim. Treat the arg as a path only if it plausibly
// looks like one — short, no newlines / null bytes — and names an
// existing regular file; otherwise use it as literal text.
function resolveTsImports(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (
    raw.length > 0 &&
    raw.length < 4096 &&
    !/[\n\r\0]/.test(raw) &&
    existsSync(raw) &&
    statSync(raw).isFile()
  ) {
    return readFileSync(raw, "utf8")
  }
  return raw
}

// Parse `--ts-driver` (`<Name>:<specifier>` or bare `<specifier>`) and
// rewrite the specifier to a source-tree path when running from a
// checkout, so emitted tests resolve without a prior `bun run build`.
function resolveTsDriver(raw: string): TsTestDriverImport {
  const colonIdx = raw.indexOf(":")
  const isNamedImport = colonIdx > 0 && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw.slice(0, colonIdx))
  const importName = isNamedImport ? raw.slice(0, colonIdx) : undefined
  const specifier = isNamedImport ? raw.slice(colonIdx + 1) : raw
  return { importName, specifier: rewriteSpecifierForSource(specifier) }
}

// When running from source (the CLI lives in a checkout rather than
// under node_modules/), rewrite `<packageName>/<subpath>` driver
// specifiers to absolute paths into the source tree, using the
// `exports` field of package.json. Specifiers that don't match the
// package name, or subpaths that don't map, are returned unchanged.
function rewriteSpecifierForSource(spec: string): string {
  if (!isRunningFromSource()) return spec
  const pkgName = RAW_PACKAGE_JSON.name
  const exports = RAW_PACKAGE_JSON.exports
  if (!pkgName || !exports) return spec
  if (spec !== pkgName && !spec.startsWith(`${pkgName}/`)) return spec
  const subpath = spec === pkgName ? "." : `./${spec.slice(pkgName.length + 1)}`
  const distPath = resolveExportSubpath(exports, subpath)
  if (!distPath) return spec
  const sourcePath = distPathToSource(distPath)
  if (!sourcePath) return spec
  const abs = rootPath(sourcePath)
  return existsSync(abs) ? abs : spec
}

function isRunningFromSource(): boolean {
  return existsSync(rootPath("src")) && existsSync(rootPath("bin"))
}

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
// prefix and swapping `.js` for `.ts` takes us back to the authoring
// path. Specifiers that don't fit the pattern are left unmapped.
function distPathToSource(distPath: string): string | undefined {
  if (!distPath.startsWith("./dist/")) return undefined
  return distPath.replace(/^\.\/dist\//, "./").replace(/\.js$/, ".ts")
}
