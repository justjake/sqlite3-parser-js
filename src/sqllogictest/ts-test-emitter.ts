// Emit a TypeScript test module from parsed sqllogictest records.
//
// The shape mirrors what `bin/sqllogictest-parser --ts` produces: a
// single `describe(...)` block that instantiates a driver (via
// `<Binding>.setup({...})`) and calls `driver.runRecord(<record>)` from
// inside each `test(...)`. Trivia — top-level comments / blank runs and
// modifier / body / result comments attached to a record — is rendered
// as `//` comments around the corresponding `test` call so the emitted
// file reads like the source `.test` script.
//
// The emitter is pure: it takes parsed records plus a resolved import
// specifier and returns a string. Callers that need to load the
// driver from a package-name specifier (rewriting to a source path,
// resolving via `exports`, etc.) do that before calling in.

import { shouldSkipForDbname } from "./drivers.ts"
import type { TestCondition, TestQuery, TestRecord, TestStatement } from "./nodes.ts"

type TestSqlRecord = TestStatement | TestQuery

/**
 * How the driver module is imported by the generated file.
 *
 * The driver is whatever module implements the
 * `{ setup({ describe, test, expect, beforeEach, afterEach }): { runRecord } }`
 * shape used by `runRecord(record)`. In this repo the default is
 * `SQLite3ParserTestDriver` from `sqlite3-parser/sqllogictest`.
 */
export interface TsTestDriverImport {
  /** Import specifier, e.g. `"sqlite3-parser/sqllogictest"`. */
  readonly specifier: string
  /**
   * Named import from {@link specifier}. When `undefined`, a namespace
   * import (`import * as <binding> from "..."`) is emitted; the binding
   * is derived from the last path segment of the specifier.
   */
  readonly importName?: string
}

export interface EmitTsTestModuleOptions {
  /** Title passed to the top-level `describe(...)` — conventionally the `.test` source path. */
  readonly title: string
  /** Module that exports `{ describe, test, expect, beforeEach, afterEach }`. */
  readonly runner: string
  /** Driver module and how to import it. */
  readonly driver: TsTestDriverImport
  /**
   * Extra TypeScript inlined into the import zone after the runner and
   * driver imports. Trailing whitespace is trimmed; an empty / undefined
   * string emits nothing.
   */
  readonly imports?: string
  /**
   * When set, records whose `skipif` / `onlyif` modifiers would skip
   * for this dbname are emitted as `test.skip(...)` instead of `test(...)`.
   * Omit to run every record unconditionally.
   */
  readonly dbname?: string
}

/**
 * Emit the complete TS source of a test module for {@link records}.
 *
 * The returned string is ready to write to disk. See the file-level
 * comment for the exact shape; consumers don't need to know it beyond
 * "calls `driver.runRecord(record)` per statement / query".
 */
export function emitTsTestModule(
  records: readonly TestRecord[],
  options: EmitTsTestModuleOptions,
): string {
  const { title, runner, driver, imports, dbname } = options
  const namespaceBinding = driver.importName ?? defaultNamespaceBinding(driver.specifier)
  const driverBinding = driver.importName ?? namespaceBinding

  const out: string[] = []
  out.push(`// Generated from ${title}`)
  out.push(`// by bin/sqllogictest-parser. Do not edit by hand.`)
  out.push("")
  out.push(
    `import { describe, test, expect, beforeEach, afterEach } from ${JSON.stringify(runner)}`,
  )
  if (driver.importName !== undefined) {
    out.push(`import { ${driver.importName} } from ${JSON.stringify(driver.specifier)}`)
  } else {
    out.push(`import * as ${namespaceBinding} from ${JSON.stringify(driver.specifier)}`)
  }
  const trimmedImports = imports?.replace(/\s+$/, "")
  if (trimmedImports !== undefined && trimmedImports.length > 0) {
    out.push(trimmedImports)
  }
  out.push("")
  out.push(`describe(${JSON.stringify(title)}, () => {`)
  out.push(
    `  const driver = ${driverBinding}.setup({ describe, test, expect, beforeEach, afterEach })`,
  )
  out.push("")

  let nextTestIndex = 1
  for (const rec of records) {
    const index = rec.type === "statement" || rec.type === "query" ? nextTestIndex++ : undefined
    emitTestRecord(out, rec, dbname, "  ", index)
  }

  out.push(`})`)
  out.push("")
  return out.join("\n")
}

function emitTestRecord(
  out: string[],
  rec: TestRecord,
  dbname: string | undefined,
  indent: string,
  index: number | undefined,
): void {
  if (rec.type === "comment") {
    out.push(`${indent}${commentToTs(rec.text)}`)
    return
  }
  if (rec.type === "blank") {
    for (let k = 0; k < rec.count; k++) out.push("")
    return
  }

  // Leading trivia in source order: each modifier's comments, then the
  // modifier itself (as `// skipif X`), then the record header's own
  // comments.
  for (const c of rec.conditions) {
    if (c.comments) {
      for (const cmt of c.comments) out.push(`${indent}${commentToTs(cmt.text)}`)
    }
    out.push(`${indent}// ${c.kind} ${c.engine}`)
  }
  if (rec.comments) {
    for (const cmt of rec.comments) out.push(`${indent}${commentToTs(cmt.text)}`)
  }

  if (rec.type === "hash-threshold") {
    out.push(`${indent}// hash-threshold ${rec.threshold}`)
    return
  }
  if (rec.type === "halt") {
    out.push(`${indent}// halt`)
    return
  }

  const skipped = dbname !== undefined && shouldSkipForDbname(rec, dbname)
  const testFn = skipped ? "test.skip" : "test"
  const title = recordTitle(rec, index ?? 0)

  out.push(`${indent}${testFn}(${JSON.stringify(title)}, () => {`)
  emitBodyTriviaComments(out, rec, `${indent}  `)
  const literal = formatRecordLiteral(rec, `${indent}  `)
  out.push(`${indent}  driver.runRecord(${literal})`)
  out.push(`${indent}})`)
}

function emitBodyTriviaComments(out: string[], rec: TestSqlRecord, indent: string): void {
  if (rec.bodyComments) {
    for (const c of rec.bodyComments) out.push(`${indent}${commentToTs(c.text)}`)
  }
  if (rec.type === "query" && rec.resultComments) {
    for (const c of rec.resultComments) {
      out.push(`${indent}// (result) ${stripHashPrefix(c.text)}`)
    }
  }
}

function recordTitle(rec: TestSqlRecord, index: number): string {
  const preview = sqlPreview(rec.sql, 60)
  if (rec.type === "statement") return `#${index} statement ${rec.expect}: ${preview}`
  const parts = ["query", rec.types, rec.sort]
  if (rec.label !== undefined) parts.push(rec.label)
  return `#${index} ${parts.join(" ")}: ${preview}`
}

function sqlPreview(sql: string, max: number): string {
  const collapsed = sql.replace(/\s+/g, " ").trim()
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, max - 1).trimEnd()}…`
}

function commentToTs(raw: string): string {
  return `// ${stripHashPrefix(raw)}`
}

function stripHashPrefix(raw: string): string {
  return raw.replace(/^#\s?/, "")
}

// Serialize a record as a TS object literal for the test body. Trivia
// fields are dropped because they're already rendered as `//` comments
// around the test call, and a `TestCondition`'s own `comments` list is
// stripped for the same reason. JSON.stringify's output is valid JS and
// naturally drops `undefined` keys.
function formatRecordLiteral(rec: TestSqlRecord, indent: string): string {
  const logical: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (k === "comments" || k === "bodyComments" || k === "resultComments") continue
    logical[k] = v
  }
  logical["conditions"] = (rec.conditions as readonly TestCondition[]).map((c) => ({
    kind: c.kind,
    engine: c.engine,
    line: c.line,
  }))
  const json = JSON.stringify(logical, undefined, 2)
  return json.replace(/\n/g, `\n${indent}`)
}

function defaultNamespaceBinding(specifier: string): string {
  const tail = specifier.split("/").pop() ?? "driver"
  const sanitized = tail.replace(/[^A-Za-z0-9_$]/g, "_")
  if (sanitized.length === 0 || /^[0-9]/.test(sanitized)) return `_${sanitized || "driver"}`
  return sanitized
}
