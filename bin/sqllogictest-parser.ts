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

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { parseTest } from "../src/sqllogictest/testparser.ts"
import { shouldSkipForDbname } from "../src/sqllogictest/drivers.ts"
import type { TestRecord } from "../src/sqllogictest/nodes.ts"
import { emitTsTestModule, type TsTestDriverImport } from "../src/sqllogictest/ts-test-emitter.ts"
import {
  CliUsageError,
  resolveCliInput,
  resolvePackageImport,
  runScript,
} from "../scripts/utils.ts"

const DEFAULT_TS_RUNNER = "bun:test"
const DEFAULT_TS_DRIVER = "SQLite3ParserTestDriver:sqlite3-parser/sqllogictest"

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
      "  --out <path>           Write output to <path> instead of stdout.  When\n" +
      "                         --ts is active and --ts-driver resolves to a\n" +
      "                         source-tree path, the emitted import is made\n" +
      "                         relative to <path>'s directory so the generated\n" +
      "                         file is portable across checkouts.\n" +
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
      out: { type: "string" },
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
    const outPath = values["out"]
    const tsDriver = resolveTsDriver(values["ts-driver"] ?? DEFAULT_TS_DRIVER, outPath)

    const { source, filename } = await resolveCliInput(positionals)
    const result = parseTest({
      source,
      filename: filename ?? "<inline>",
      emitTrivia,
    })

    for (const err of result.errors) console.error(err.format())

    const records = idxRange ? sliceByIndex(result.records, idxRange) : result.records

    let output: string
    if (tsMode) {
      output = emitTsTestModule(records, {
        title: result.filename,
        runner: tsRunner,
        driver: tsDriver,
        imports: tsImports,
        dbname,
        startIndex: idxRange?.lo,
      })
    } else if (sqlMode) {
      const bodies: string[] = []
      for (const rec of records) {
        if (rec.type !== "statement" && rec.type !== "query") continue
        if (dbname !== undefined && shouldSkipForDbname(rec, dbname)) continue
        bodies.push(`${rec.sql};`)
      }
      output = bodies.join("\n")
    } else {
      const filtered =
        dbname !== undefined ? records.filter((r) => !shouldSkipForDbname(r, dbname)) : records
      output = JSON.stringify(filtered, undefined, 2)
    }

    if (outPath !== undefined) {
      const abs = resolve(outPath)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, output.endsWith("\n") ? output : `${output}\n`)
    } else {
      console.log(output)
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
// resolve the specifier through package.json `exports` when running
// from source, so emitted tests import the in-repo source file rather
// than a missing `dist/` entry. The resolved path is made relative to
// the output file's location (or the current working directory, when
// --out is absent) so the generated file is portable across checkouts.
function resolveTsDriver(raw: string, outPath: string | undefined): TsTestDriverImport {
  const colonIdx = raw.indexOf(":")
  const isNamedImport = colonIdx > 0 && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw.slice(0, colonIdx))
  const importName = isNamedImport ? raw.slice(0, colonIdx) : undefined
  const rawSpec = isNamedImport ? raw.slice(colonIdx + 1) : raw
  // `resolvePackageImport` takes a file URL and strips to its dirname.
  // With no --out we don't have a real file path to anchor on, so
  // synthesize a faux child of the cwd so its dirname is the cwd.
  const outFilePath = outPath !== undefined ? resolve(outPath) : resolve(process.cwd(), "stdout")
  const callerUrl = pathToFileURL(outFilePath).href
  return { importName, specifier: resolvePackageImport(rawSpec, callerUrl) }
}
