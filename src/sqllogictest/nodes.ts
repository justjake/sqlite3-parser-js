// AST node types for the sqllogictest `.test` file format.
//
// The format is described in the "Test Script Format" section of the
// upstream documentation:
//   https://sqlite.org/sqllogictest/doc/trunk/about.wiki
// The reference parser is `vendor/submodule/sqllogictest/src/sqllogictest.c`.

/**
 * Any record that can appear in a `.test` script.
 *
 * Per the "Test Script Format" section:
 * "Test scripts consist of zero or more records. A record is a single
 * statement or query or a control record. Each record is separated
 * from its neighbors by one or more blank lines." Lines beginning with
 * `#` are comments and do not count as blank.
 *
 * See https://sqlite.org/sqllogictest/doc/trunk/about.wiki.
 */
export type TestRecord =
  | TestStatement
  | TestQuery
  | TestHashThreshold
  | TestHalt
  | TestComment
  | TestBlank

interface TestRecordBase {
  /** 1-based line number of the record header line (after any modifiers). */
  readonly line: number
  /** `skipif` / `onlyif` modifiers preceding the header, in source order. */
  readonly conditions: readonly TestCondition[]
  /**
   * Leading `#` comments directly above this record — i.e. above the
   * header, or above the first modifier if the record has any, with no
   * intervening blank line. A blank line terminates the attachment and
   * promotes earlier comments to top-level {@link TestComment} records.
   *
   * Populated only when the parser is run with `emitTrivia: true`;
   * `undefined` otherwise.
   */
  readonly comments?: readonly TestComment[]
}

/**
 * A `skipif <database-name>` or `onlyif <database-name>` modifier that
 * conditions the next record on the target database engine.
 *
 * Per "Test Script Format":
 * "skipif <database-name> and onlyif <database-name> conditionally
 * execute statements and queries based on the target database engine."
 *
 * The engine name is matched case-insensitively by the upstream runner.
 */
export interface TestCondition {
  readonly kind: "skipif" | "onlyif"
  readonly engine: string
  readonly line: number
  /**
   * Leading `#` comments directly above this modifier line, with no
   * intervening blank. Populated only when the parser is run with
   * `emitTrivia: true`; `undefined` otherwise.
   */
  readonly comments?: readonly TestComment[]
}

/**
 * A `statement ok` or `statement error` record — a SQL statement with
 * an expected outcome.
 *
 * Per "Test Script Format":
 * "A statement record begins with one of the following two lines:
 * statement ok [or] statement error." The SQL command follows on
 * subsequent lines and ends at the first blank line. Statements marked
 * `ok` are expected to succeed; those marked `error` are expected to
 * fail.
 */
export interface TestStatement extends TestRecordBase {
  readonly type: "statement"
  readonly expect: "ok" | "error"
  readonly sql: string
  /**
   * Comments that appeared between SQL body lines, in source order.
   * The SQL text in {@link sql} is joined without these, so downstream
   * SQL parsers see contiguous input. Populated only when the parser
   * is run with `emitTrivia: true`; `undefined` otherwise.
   */
  readonly bodyComments?: readonly TestComment[]
}

/**
 * A `query <type-string> <sort-mode> <label>` record — a SQL query
 * paired with its expected column types, sort mode, optional label, and
 * optional expected result set.
 *
 * Per "Test Script Format":
 * "A query record begins with a line of the following form:
 * query <type-string> <sort-mode> <label>." The SQL appears next,
 * followed by `----` and the expected result values. Expected values
 * may be omitted entirely in prototype scripts — in which case
 * {@link expected} is `undefined`.
 */
export interface TestQuery extends TestRecordBase {
  readonly type: "query"
  /**
   * One character per result column:
   *
   * - `T` text
   * - `I` integer
   * - `R` floating-point / real
   */
  readonly types: string
  /**
   * How the runner is expected to order rows before comparing.
   *
   * - `nosort` preserves database order; only meaningful with `ORDER BY`.
   * - `rowsort` sorts whole rows using `strcmp` on rendered text.
   * - `valuesort` sorts individual values without respecting row groupings.
   */
  readonly sort: "nosort" | "rowsort" | "valuesort"
  /** Optional label used to cross-reference result sets across engines. */
  readonly label?: string
  readonly sql: string
  /** The expected result block; `undefined` if no `----` separator is present. */
  readonly expected?: TestExpected
  /**
   * Comments between SQL body lines (before `----`), in source order.
   * Not merged into {@link sql}. Populated only when `emitTrivia: true`;
   * `undefined` otherwise.
   */
  readonly bodyComments?: readonly TestComment[]
  /**
   * Comments between expected-result lines (after `----`), in source
   * order. Empty if the record has no `----` separator. Populated
   * only when `emitTrivia: true`; `undefined` otherwise.
   */
  readonly resultComments?: readonly TestComment[]
}

/**
 * The expected-result block of a {@link TestQuery}: either the literal
 * list of rendered values, or the collapsed "N values hashing to H"
 * form produced when the result count exceeds the active
 * `hash-threshold`.
 */
export type TestExpected =
  | {
      readonly kind: "values"
      /**
       * Rendered expected values, one per source line. Under `nosort`
       * they are grouped by row in database order; under `rowsort` /
       * `valuesort` they appear in the pre-sorted order the runner
       * compares against.
       */
      readonly values: readonly string[]
    }
  | {
      readonly kind: "hash"
      /** Number of rendered values that contributed to the hash. */
      readonly count: number
      /** Hex MD5 of the newline-joined values, as written in source. */
      readonly hash: string
    }

/**
 * A `hash-threshold <N>` control record.
 *
 * Per "Test Script Format":
 * "hash-threshold ... limits values recorded; exceeding the threshold
 * triggers MD5 hashing instead." A threshold of `0` disables hashing.
 */
export interface TestHashThreshold extends TestRecordBase {
  readonly type: "hash-threshold"
  readonly threshold: number
}

/**
 * A run of one or more consecutive blank lines between records.
 *
 * Only emitted when the parser is run with `emitTrivia: true`. Runs
 * are coalesced: `N` consecutive blank lines produce a single
 * `TestBlank` with `count === N`. The trailing blank of a record body
 * (which terminates the body) is itself part of the blank run reported
 * by the following `TestBlank`.
 */
export interface TestBlank {
  readonly type: "blank"
  /** 1-based line number of the first blank line in the run. */
  readonly line: number
  /** Number of consecutive blank lines in the run (≥ 1). */
  readonly count: number
}

/**
 * A `#`-prefixed comment line — trivia, only emitted when the parser
 * is run with `emitTrivia: true`.
 *
 * Per "Test Script Format":
 * "Lines beginning with `#` are comments ... are not considered blank
 * lines and cannot be used to separate records."
 *
 * Appears in the top-level `records` list when a comment is separated
 * from any record by a blank line. Comments directly above a record
 * or modifier (no intervening blank) attach to that record's / that
 * modifier's `comments` field instead. Comments inside a record body
 * (between SQL lines, or between result lines after `----`) are kept
 * on the record as `bodyComments` / `resultComments` so the SQL and
 * result payloads stay contiguous.
 */
export interface TestComment {
  readonly type: "comment"
  readonly line: number
  /** Raw source text of the line, including the leading `#`. */
  readonly text: string
}

/**
 * A `halt` control record — a runtime signal telling the runner to
 * stop processing the script.
 *
 * Per "Test Script Format": "halt stops script processing for debugging."
 *
 * Executors are expected to honour this signal; the parser does not
 * interpret it and continues emitting any records that follow.
 */
export interface TestHalt extends TestRecordBase {
  readonly type: "halt"
}
