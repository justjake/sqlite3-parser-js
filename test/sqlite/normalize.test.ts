// Tokenizer-level slices of sqlite's test/normalize.test.
//
// The original tests exercise sqlite3_normalize(), which rewrites a
// SQL statement using a mini-tokenizer + constant-folding pass.  We
// don't reimplement normalize; instead, for each normalize test
// with significant tokenizer coverage we assert that our tokens match
// the characters sqlite fed into its normalize pipeline.
//
// Cross-reference: test numbers (120, 130, 150, 330, 350, 450, 670)
// correspond to the `do_test` rows in test/normalize.test.

import { describe, test, expect } from "bun:test"
import { lex, lexNames } from "../helpers.ts"

describe("normalize-120 (comments scattered through a SELECT)", () => {
  const sql = `SELECT NULL, b FROM t1 -- comment text
 WHERE d IN (WITH t(a) AS (VALUES(5)) /* CTE */
             SELECT a FROM t) OR e='hello';`

  test("trivia-free stream matches the normalized keyword skeleton", () => {
    expect(lexNames(sql)).toEqual([
      "SELECT",
      "NULL",
      "COMMA",
      "ID",
      "FROM",
      "ID",
      "WHERE",
      "ID",
      "IN",
      "LP",
      "WITH",
      "ID",
      "LP",
      "ID",
      "RP",
      "AS",
      "LP",
      "VALUES",
      "LP",
      "INTEGER",
      "RP",
      "RP",
      "SELECT",
      "ID",
      "FROM",
      "ID",
      "RP",
      "OR",
      "ID",
      "EQ",
      "STRING",
      "SEMI",
    ])
  })

  test("both comment styles tokenise as COMMENT", () => {
    const kept = lex(sql, { emitTrivia: true })
    const comments = kept.filter((t) => t.name === "COMMENT").map((t) => t.text)
    expect(comments).toEqual(["-- comment text", "/* CTE */"])
  })
})

describe("normalize-150 (illegal blob literal with odd hex count)", () => {
  // sqlite-3: `SELECT x'abc';` → unrecognized token "x'abc'"
  test("x'abc' (odd nibble count) is a single ILLEGAL token", () => {
    const toks = lex("SELECT x'abc';")
    expect(toks[1]).toEqual({ name: "ILLEGAL", text: "x'abc'" })
  })
})

describe("normalize-330 (variable-reference syntax forms)", () => {
  // sqlite-normalize: x,$::abc(15),y,@abc,z,?99,w  all variables/IDs.
  const sql = "SELECT x,$::abc(15),y,@abc,z,?99,w FROM t1"
  test("all variable forms lex as expected", () => {
    expect(lex(sql)).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "ID", text: "x" },
      { name: "COMMA", text: "," },
      // The Tcl `.comment` in normalize.test says this collapses to `?`.
      // Our tokenizer captures the full variable form including the
      // embedded `(15)` — sqlite's TCL-style var-expansion parsing.
      { name: "VARIABLE", text: "$::abc(15)" },
      { name: "COMMA", text: "," },
      { name: "ID", text: "y" },
      { name: "COMMA", text: "," },
      { name: "VARIABLE", text: "@abc" },
      { name: "COMMA", text: "," },
      { name: "ID", text: "z" },
      { name: "COMMA", text: "," },
      { name: "VARIABLE", text: "?99" },
      { name: "COMMA", text: "," },
      { name: "ID", text: "w" },
      { name: "FROM", text: "FROM" },
      { name: "ID", text: "t1" },
    ])
  })
})

describe("normalize-340 (heterogeneous IN list with blob + string + expr)", () => {
  const sql = "SELECT 15 IN (1,2,3,(SELECT * FROM t1),'xyz',x'abcd',22*(x+5),null);"
  test("blob literal sits correctly between the string and the multiplication", () => {
    const toks = lex(sql)
    const blobAt = toks.findIndex((t) => t.text === "x'abcd'")
    expect(toks[blobAt]).toEqual({ name: "BLOB", text: "x'abcd'" })
    expect(toks[blobAt - 1]).toEqual({ name: "COMMA", text: "," })
    expect(toks[blobAt + 1]).toEqual({ name: "COMMA", text: "," })
  })
})

describe("normalize-450 & 670 (bracketed and double-quoted identifiers)", () => {
  test("normalize-450: [a] and [x] are IDs", () => {
    expect(lex("SELECT [a] FROM t1 WHERE [x];")).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "ID", text: "[a]" },
      { name: "FROM", text: "FROM" },
      { name: "ID", text: "t1" },
      { name: "WHERE", text: "WHERE" },
      { name: "ID", text: "[x]" },
      { name: "SEMI", text: ";" },
    ])
  })

  test('normalize-670: "col f" and [col f] both tokenise as ID', () => {
    const toks = lex('SELECT "col f", [col f] FROM t1;')
    const ids = toks.filter((t) => t.name === "ID").map((t) => t.text)
    expect(ids).toEqual(['"col f"', "[col f]", "t1"])
  })
})

describe("normalize-550 (concat, double-quoted fallback)", () => {
  // a||'b' produces ID CONCAT STRING.
  // `a+"b"` is ID PLUS ID — `"b"` is a double-quoted identifier, not
  // a string literal, in SQLite's tokenizer.  (Whether it LATER
  // resolves to a string vs a column name is a parser / query planner
  // question; the tokenizer treats it as an ID.)
  test("a||'b', a+\"b\"", () => {
    expect(lex("SELECT a+1, a||'b', a+\"b\" FROM t1;")).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "ID", text: "a" },
      { name: "PLUS", text: "+" },
      { name: "INTEGER", text: "1" },
      { name: "COMMA", text: "," },
      { name: "ID", text: "a" },
      { name: "CONCAT", text: "||" },
      { name: "STRING", text: "'b'" },
      { name: "COMMA", text: "," },
      { name: "ID", text: "a" },
      { name: "PLUS", text: "+" },
      { name: "ID", text: '"b"' },
      { name: "FROM", text: "FROM" },
      { name: "ID", text: "t1" },
      { name: "SEMI", text: ";" },
    ])
  })
})

describe("normalize-760 (nested blob inside an IN list)", () => {
  const sql = "SELECT x FROM t1 WHERE x IN ([x] IS NOT NULL, NULL, 1, 'a', \"b\", x'00');"
  test("every leaf token resolves correctly", () => {
    const toks = lex(sql)
    expect(toks.map((t) => t.name)).toEqual([
      "SELECT",
      "ID",
      "FROM",
      "ID",
      "WHERE",
      "ID",
      "IN",
      "LP",
      "ID",
      "IS",
      "NOT",
      "NULL",
      "COMMA",
      "NULL",
      "COMMA",
      "INTEGER",
      "COMMA",
      "STRING",
      "COMMA",
      "ID",
      "COMMA",
      "BLOB",
      "RP",
      "SEMI",
    ])
  })
})
