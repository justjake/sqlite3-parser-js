// Port of sqlite's test/main.test main-1.* block (sqlite3_complete()).
//
// `sqlite3_complete(sql)` returns 1 iff `sql` contains at least one
// syntactically-complete statement terminated by a bare semicolon.
// The key behaviour we care about at the tokenizer level:
//
//   * a semicolon INSIDE a string or a comment does NOT terminate a
//     statement, because the tokenizer swallows it as part of the
//     string/comment token;
//   * a trailing unterminated string or bracket is ILLEGAL and so the
//     tokenizer never reaches the final semicolon;
//   * `-- line comment` and `/* block */` are pure trivia.
//
// We don't implement sqlite3_complete, so each test below asserts the
// property its Tcl counterpart relies on: whether a terminating SEMI
// is produced at top level (outside any string/comment).

import { describe, test, expect } from "bun:test"
import { lex } from "../helpers.ts"

/** Does the token stream contain a top-level (non-trivia) SEMI? */
function hasTopLevelSemi(sql: string): boolean {
  return lex(sql).some((t) => t.name === "SEMI")
}

/** Does the token stream contain any ILLEGAL token? */
function hasIllegal(sql: string): boolean {
  return lex(sql).some((t) => t.name === "ILLEGAL")
}

describe("main-1 (sqlite3_complete boundary cases)", () => {
  // main-1.3.0: a line comment containing a `;` does not count.
  test("main-1.3.0: '-- a comment ;' has no top-level SEMI", () => {
    expect(hasTopLevelSemi("-- a comment ;\n")).toBe(false)
  })
  // main-1.3.1: same for a block comment.
  test("main-1.3.1: '/* a comment ; */' has no top-level SEMI", () => {
    expect(hasTopLevelSemi("/* a comment ; */")).toBe(false)
  })
  // main-1.4.0 / 1.4.1 / 1.4.2: once a real `;` follows, yes it counts.
  test("main-1.4.0: after a line comment, a later ';' IS top-level", () => {
    expect(hasTopLevelSemi("-- a comment ;\n   ;\n")).toBe(true)
  })
  test("main-1.4.1: after a block comment, a later ';' IS top-level", () => {
    expect(hasTopLevelSemi("/* a comment ; */\n   ;\n")).toBe(true)
  })
  test("main-1.4.2: block comment then ';' on same line", () => {
    expect(hasTopLevelSemi("/* a comment ; */ ;")).toBe(true)
  })

  // main-1.5: a statement ending inside an UNTERMINATED single-quoted
  // string has no valid completion — the tokenizer produces ILLEGAL and
  // no top-level SEMI is reached.
  test('main-1.5: "DROP TABLE \'xyz;" is incomplete (ILLEGAL, no SEMI)', () => {
    const sql = "DROP TABLE 'xyz;"
    expect(hasIllegal(sql)).toBe(true)
    expect(hasTopLevelSemi(sql)).toBe(false)
  })

  // main-1.6: properly-terminated single-quoted string — complete.
  test("main-1.6: \"DROP TABLE 'xyz';\" ends with SEMI", () => {
    const toks = lex("DROP TABLE 'xyz';")
    expect(toks[toks.length - 1]).toEqual({ name: "SEMI", text: ";" })
  })

  // main-1.7: same idea with double quotes — identifier, not string,
  // but still consumes up to a closing `"`.  Unterminated → ILLEGAL.
  test("main-1.7: 'DROP TABLE \"xyz;' is incomplete (ILLEGAL)", () => {
    const sql = 'DROP TABLE "xyz;'
    expect(hasIllegal(sql)).toBe(true)
  })

  // main-1.8: mixed "xyz' — the `"` opens an identifier that runs to
  // end-of-input; the closing `;` is swallowed by the unterminated
  // identifier.  Result: ILLEGAL.
  test("main-1.8: 'DROP TABLE \"xyz\\';' is incomplete (ILLEGAL)", () => {
    expect(hasIllegal("DROP TABLE \"xyz';")).toBe(true)
  })

  // main-1.9: properly-terminated double-quoted id — complete.
  test("main-1.9: 'DROP TABLE \"xyz\";' ends with SEMI", () => {
    const toks = lex('DROP TABLE "xyz";')
    expect(toks[toks.length - 1]).toEqual({ name: "SEMI", text: ";" })
  })

  // main-1.11: trailing whitespace after the semicolon doesn't matter.
  test("main-1.11: trailing whitespace still yields a SEMI", () => {
    expect(hasTopLevelSemi("DROP TABLE xyz; ")).toBe(true)
  })

  // main-1.12: trailing `-- hi` comment after the semicolon is fine.
  test("main-1.12: trailing line comment is ignored", () => {
    expect(hasTopLevelSemi("DROP TABLE xyz; -- hi ")).toBe(true)
  })

  // main-1.14: an arithmetic expression ending with `;` is complete.
  test('main-1.14: "SELECT a-b FROM t1;"', () => {
    expect(hasTopLevelSemi("SELECT a-b FROM t1; ")).toBe(true)
  })
})
