// Test-runner drivers that back the `.runRecord(record)` call emitted
// by `bin/sqllogictest-parser --ts`. A driver wires a parsed
// `TestRecord` to whatever checks the consuming test suite cares about.
//
// `SQLite3ParserTestDriver` is the default: for each `statement` /
// `query` it asserts the parse succeeds (via `parseOrThrow`) and
// snapshots the resulting s-expression through the runner's `expect`.

import {
  parseStmtOrThrow,
  Sqlite3ParserDiagnosticError,
  ParseStmtOk,
  ParseOk,
  parseOrThrow,
} from "../../generated/current.ts"
import { toSexpr } from "../ast/traverse.ts"
import type { TestRecord } from "./nodes.ts"

/** Minimal shape of the `expect(...).toMatchSnapshot()` API we use. */
export interface DriverExpect {
  (value: unknown): { toMatchSnapshot(name?: string): void }
}

/**
 * Test-runner hooks the driver receives at {@link SQLite3ParserTestDriver.setup}
 * time. `expect` is typed precisely because the driver calls
 * `.toMatchSnapshot()` on it; the rest are left `unknown` since the
 * default driver doesn't touch them, but they're passed through so
 * future driver extensions can register fixtures without plumbing
 * them separately.
 */
export interface TestDriverHooks {
  readonly describe: unknown
  readonly test: unknown
  readonly expect: DriverExpect
  readonly beforeEach: unknown
  readonly afterEach: unknown
}

/** Return type of {@link SQLite3ParserTestDriver.setup}. */
export interface TestDriver {
  runRecord(record: TestRecord): void
}

/**
 * Default driver: for every `statement` / `query` record, parse the
 * SQL with `parseOrThrow` and snapshot `toSexpr(root)` through the
 * runner's `expect(...).toMatchSnapshot()`. A parse error throws
 * `Sqlite3ParserDiagnosticError` and fails the enclosing test;
 * otherwise the s-expression must match the stored snapshot.
 *
 * Control records (`hash-threshold`, `halt`) and trivia (`comment`,
 * `blank`) are no-ops — the CLI only emits tests for SQL-bearing
 * records, but the driver accepts the full union so callers can
 * forward records verbatim.
 */
export const SQLite3ParserTestDriver = {
  setup(hooks: TestDriverHooks): TestDriver {
    const { expect } = hooks
    return {
      runRecord(record: TestRecord): void {
        if (record.type !== "statement" && record.type !== "query") return
        const errorAllowed = record.type === "statement" && record.expect === "error"
        let result: ParseOk | ParseStmtOk | undefined
        try {
          if (record.type === "statement") {
            result = parseOrThrow(record.sql)
          } else {
            result = parseStmtOrThrow(record.sql)
          }
        } catch (e) {
          if (!errorAllowed || !(e instanceof Sqlite3ParserDiagnosticError)) {
            throw e
          }
          expect(e.errors.join("\n")).toMatchSnapshot()
        }
        if (result) {
          expect(toSexpr(result.root)).toMatchSnapshot()
        }
      },
    }
  },
}

/**
 * Evaluate a record's `skipif` / `onlyif` modifiers against a target
 * database name, using upstream's case-insensitive engine-name match.
 * Returns `true` when the record would be skipped for `dbname`:
 *
 * - a `skipif <engine>` modifier matches `dbname`, or
 * - an `onlyif <engine>` modifier names a different engine.
 *
 * Trivia records (`comment`, `blank`) have no conditions and always
 * return `false`.
 */
export function shouldSkipForDbname(record: TestRecord, dbname: string): boolean {
  if (record.type === "comment" || record.type === "blank") return false
  const target = dbname.toLowerCase()
  for (const c of record.conditions) {
    const engine = c.engine.toLowerCase()
    if (c.kind === "skipif" && engine === target) return true
    if (c.kind === "onlyif" && engine !== target) return true
  }
  return false
}
