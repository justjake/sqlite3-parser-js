// Parser for the sqllogictest `.test` file format.
//
// Format reference: https://sqlite.org/sqllogictest/doc/trunk/about.wiki
// C reference parser: vendor/submodule/sqllogictest/src/sqllogictest.c
//
// Records are separated by blank (or whitespace-only) lines. Lines
// beginning with `#` at column 0 are comments and are stripped before
// record assembly — including inside a record body. All directive
// keywords are case-sensitive; only the engine-name argument to
// `skipif` / `onlyif` is matched case-insensitively at runtime (the
// parser preserves it verbatim).
//
// `halt` is emitted as an ordinary record and parsing continues past
// it. The upstream C runner treats `halt` as a stop signal because it
// parses and executes in the same loop; here it is a runtime concern
// for whatever consumes {@link TestParseResult.records}.
//
// Trivia (when `emitTrivia: true`):
//   * A `#` comment directly above a non-blank line (no intervening
//     blank) attaches to that line — onto a modifier's `comments` if
//     the line is a `skipif`/`onlyif`, or onto the record's `comments`
//     if it is a record header. A blank line between a comment and the
//     next non-blank line breaks the attachment and promotes the
//     comment to a top-level `TestComment` record.
//   * Comments between SQL body lines or between result lines are kept
//     on the enclosing record as `bodyComments` / `resultComments` so
//     the `sql` and expected values stay contiguous.
//   * Runs of consecutive blank lines between records are coalesced
//     into a single `TestBlank` record (with `count === N`).
//
// When `emitTrivia: false` the parser allocates no trivia objects,
// does no blank-run bookkeeping, and omits the `comments` /
// `bodyComments` / `resultComments` keys from record objects.

import {
  createParseDiagnostic,
  type ParseDiagnostic,
  type ParseErrorContext,
} from "../diagnostics.ts"
import type { Span } from "../tokenize.ts"
import type {
  TestComment,
  TestCondition,
  TestExpected,
  TestQuery,
  TestRecord,
  TestStatement,
} from "./nodes.ts"

export interface TestParseOptions {
  readonly source: string
  readonly filename: string
  /**
   * When true, preserve comments and blank-line runs as nodes
   * (top-level `TestComment` / `TestBlank`, attached `comments`,
   * `bodyComments`, `resultComments`). When false or omitted, trivia
   * is discarded with zero overhead.
   */
  readonly emitTrivia?: boolean
}

export interface TestParseResult {
  readonly source: string
  readonly filename: string
  readonly records: readonly TestRecord[]
  readonly errors: readonly ParseDiagnostic[]
}

/**
 * Parse a sqllogictest `.test` file. One malformed record does not
 * abort the parse: its diagnostic is collected and the walker resumes
 * at the next blank line.
 */
export function parseTest(ctx: TestParseOptions): TestParseResult {
  const { source, filename, emitTrivia = false } = ctx
  const lines = preprocess(source, emitTrivia)
  const records: TestRecord[] = []
  const errors: ParseDiagnostic[] = []

  const err = (line: Line, message: string): void => {
    errors.push(createParseDiagnostic(ctx, { message, span: lineSpan(line) }))
  }

  // Trivia state. When `emitTrivia` is off, `pending` stays undefined,
  // `blankCount` stays 0, and every trivia-only branch below is gated
  // so it never executes.
  const pending: TestComment[] | undefined = emitTrivia ? [] : undefined
  let blankStart = 0
  let blankCount = 0
  const makeComment = (l: Line): TestComment => ({
    type: "comment",
    line: l.line,
    text: l.text,
  })
  const flushBlankRun = (): void => {
    if (blankCount > 0) {
      records.push({ type: "blank", line: blankStart, count: blankCount })
      blankCount = 0
    }
  }
  const flushPendingAsTopLevel = (): void => {
    if (!pending) return
    for (const c of pending) records.push(c)
    pending.length = 0
  }

  let i = 0
  while (i < lines.length) {
    // Preamble: walk blank lines and (if tracking trivia) comments
    // that sit between records.
    if (pending) {
      while (i < lines.length) {
        const l = lines[i]
        if (l.text === "") {
          if (pending.length > 0) flushPendingAsTopLevel()
          if (blankCount === 0) blankStart = l.line
          blankCount++
          i++
          continue
        }
        if (l.isComment) {
          flushBlankRun()
          pending.push(makeComment(l))
          i++
          continue
        }
        flushBlankRun()
        break
      }
    } else {
      while (i < lines.length && lines[i].text === "") i++
    }
    if (i >= lines.length) {
      if (pending) {
        flushBlankRun()
        flushPendingAsTopLevel()
      }
      break
    }

    const conditions: TestCondition[] = []
    let lastModifier: Line | undefined
    while (i < lines.length) {
      if (pending) {
        while (i < lines.length && lines[i].isComment) {
          pending.push(makeComment(lines[i]))
          i++
        }
        if (i >= lines.length) break
      }
      const cur = lines[i]
      if (cur.text === "") break
      const tok = tokenize(cur.text)
      if (tok[0] !== "skipif" && tok[0] !== "onlyif") break
      if (tok.length < 2) {
        err(cur, `${tok[0]} requires an engine name`)
        i++
        continue
      }
      conditions.push({
        kind: tok[0],
        engine: tok[1],
        line: cur.line,
        ...(pending && { comments: pending.splice(0) }),
      })
      lastModifier = cur
      i++
    }

    if (i >= lines.length || lines[i].text === "") {
      if (lastModifier) {
        err(
          lastModifier,
          `${conditions[conditions.length - 1].kind} modifier is not followed by a record`,
        )
      }
      if (pending) flushPendingAsTopLevel()
      continue
    }

    const header = lines[i]
    const attached = pending ? pending.splice(0) : undefined
    const tok = tokenize(header.text)
    const kind = tok[0]
    i++

    if (kind === "statement") {
      const arg = tok[1]
      if (arg !== "ok" && arg !== "error") {
        err(header, "statement argument should be 'ok' or 'error'")
        i = skipToBlank(lines, i)
        continue
      }
      const sqlLines: string[] = []
      const bodyComments: TestComment[] | undefined = emitTrivia ? [] : undefined
      if (bodyComments) {
        while (i < lines.length && lines[i].text !== "") {
          const l = lines[i]
          if (l.isComment) bodyComments.push(makeComment(l))
          else sqlLines.push(l.text)
          i++
        }
      } else {
        while (i < lines.length && lines[i].text !== "") {
          sqlLines.push(lines[i].text)
          i++
        }
      }
      const record: TestStatement = {
        type: "statement",
        expect: arg,
        sql: sqlLines.join("\n"),
        line: header.line,
        conditions,
        ...(attached && { comments: attached }),
        ...(bodyComments && { bodyComments }),
      }
      records.push(record)
      continue
    }

    if (kind === "query") {
      const types = tok[1] ?? ""
      if (types.length === 0) {
        err(header, "query missing type string")
        i = skipToBlank(lines, i)
        continue
      }
      let badType = ""
      for (let k = 0; k < types.length; k++) {
        const c = types[k]
        if (c !== "T" && c !== "I" && c !== "R") {
          badType = c
          break
        }
      }
      if (badType) {
        err(header, `unknown type character '${badType}' in type string`)
        i = skipToBlank(lines, i)
        continue
      }

      let sort: "nosort" | "rowsort" | "valuesort" = "nosort"
      if (tok[2] !== undefined) {
        if (tok[2] === "nosort" || tok[2] === "rowsort" || tok[2] === "valuesort") {
          sort = tok[2]
        } else {
          err(header, `unknown sort method: '${tok[2]}'`)
          i = skipToBlank(lines, i)
          continue
        }
      }
      const label = tok[3]

      const sqlLines: string[] = []
      const bodyComments: TestComment[] | undefined = emitTrivia ? [] : undefined
      if (bodyComments) {
        while (i < lines.length && lines[i].text !== "" && lines[i].text !== "----") {
          const l = lines[i]
          if (l.isComment) bodyComments.push(makeComment(l))
          else sqlLines.push(l.text)
          i++
        }
      } else {
        while (i < lines.length && lines[i].text !== "" && lines[i].text !== "----") {
          sqlLines.push(lines[i].text)
          i++
        }
      }

      let expected: TestExpected | undefined
      const resultComments: TestComment[] | undefined = emitTrivia ? [] : undefined
      if (i < lines.length && lines[i].text === "----") {
        i++
        const resultLines: string[] = []
        if (resultComments) {
          while (i < lines.length && lines[i].text !== "") {
            const l = lines[i]
            if (l.isComment) resultComments.push(makeComment(l))
            else resultLines.push(l.text)
            i++
          }
        } else {
          while (i < lines.length && lines[i].text !== "") {
            resultLines.push(lines[i].text)
            i++
          }
        }
        expected = parseExpected(resultLines)
      }

      const record: TestQuery = {
        type: "query",
        types,
        sort,
        label,
        sql: sqlLines.join("\n"),
        expected,
        line: header.line,
        conditions,
        ...(attached && { comments: attached }),
        ...(bodyComments && { bodyComments }),
        ...(resultComments && { resultComments }),
      }
      records.push(record)
      continue
    }

    if (kind === "hash-threshold") {
      const raw = tok[1]
      const n = raw === undefined ? NaN : Number(raw)
      if (!Number.isInteger(n) || n < 0) {
        err(header, "hash-threshold requires a non-negative integer")
        i = skipToBlank(lines, i)
        continue
      }
      records.push({
        type: "hash-threshold",
        threshold: n,
        line: header.line,
        conditions,
        ...(attached && { comments: attached }),
      })
      continue
    }

    if (kind === "halt") {
      records.push({
        type: "halt",
        line: header.line,
        conditions,
        ...(attached && { comments: attached }),
      })
      continue
    }

    err(header, `unknown record type: '${kind}'`)
    i = skipToBlank(lines, i)
  }

  return { source, filename, records, errors }
}

interface Line {
  readonly text: string
  readonly line: number
  /** Byte offset of the start of this line in the original source. */
  readonly offset: number
  /** True when `text` is a `#`-prefixed comment line (only kept if `emitTrivia`). */
  readonly isComment: boolean
}

function lineSpan(line: Line): Span {
  return { offset: line.offset, length: line.text.length, line: line.line, col: 0 }
}

// Split source into lines (1-based numbering), strip trailing `\r`, and
// replace whitespace-only lines with empty strings so downstream code
// can use `text === ""` as the record-terminator test. Comment lines
// (leading `#`) are dropped entirely unless `emitTrivia` is set, in
// which case they are kept with `isComment: true` and their raw text.
function preprocess(source: string, emitTrivia: boolean): Line[] {
  const out: Line[] = []
  let i = 0
  let lineNo = 0
  const n = source.length
  while (i <= n) {
    lineNo++
    const start = i
    let j = i
    while (j < n && source.charCodeAt(j) !== 10) j++
    let raw = source.slice(i, j)
    if (raw.length > 0 && raw.charCodeAt(raw.length - 1) === 13) {
      raw = raw.slice(0, -1)
    }
    const next = j + 1
    const isComment = raw.length > 0 && raw.charCodeAt(0) === 35
    if (isComment) {
      if (emitTrivia) out.push({ text: raw, line: lineNo, offset: start, isComment: true })
    } else {
      if (raw.length > 0 && isAllWhitespace(raw)) raw = ""
      out.push({ text: raw, line: lineNo, offset: start, isComment: false })
    }
    if (j >= n) break
    i = next
  }
  return out
}

function isAllWhitespace(s: string): boolean {
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k)
    if (c !== 32 && c !== 9 && c !== 11 && c !== 12 && c !== 13) return false
  }
  return true
}

function tokenize(line: string): string[] {
  const out: string[] = []
  const n = line.length
  let i = 0
  while (i < n) {
    while (i < n && isSpaceCh(line.charCodeAt(i))) i++
    if (i >= n) break
    const start = i
    while (i < n && !isSpaceCh(line.charCodeAt(i))) i++
    out.push(line.slice(start, i))
  }
  return out
}

function isSpaceCh(c: number): boolean {
  return c === 32 || c === 9 || c === 11 || c === 12 || c === 13
}

function skipToBlank(lines: readonly Line[], from: number): number {
  let i = from
  while (i < lines.length && lines[i].text !== "") i++
  return i
}

const HASH_LINE = /^(\d+)\s+values\s+hashing\s+to\s+([0-9a-fA-F]{32})$/

function parseExpected(resultLines: readonly string[]): TestExpected {
  if (resultLines.length === 1) {
    const m = HASH_LINE.exec(resultLines[0])
    if (m) return { kind: "hash", count: Number(m[1]), hash: m[2] }
  }
  return { kind: "values", values: resultLines }
}
