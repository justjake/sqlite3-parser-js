// Parity tests for src/semantic.ts handlers.  Each entry in
// generated/<ver>/semantic-actions.snapshot.json corresponds to a
// parse.y action that SQLite runs at parse time; a passing test here
// pins one piece of SQL that upstream rejects to a `ParseError` the
// handler produces.
//
// When a new snapshot entry lands (via the drift check), add:
//   1. A handler in src/semantic.ts keyed by the entry's stableKey.
//   2. A case below citing the parse.y:LINE the handler ports and a
//      SQL string upstream rejects.

import { describe, test, expect } from "bun:test"
import { parse, withOptions } from "../generated/current.ts"

function semanticErrors(sql: string, sqlParser = parse) {
  return sqlParser(sql).errors
}

describe("table_option::nm  — parse.y:240", () => {
  test("rejects unknown bare option (`foo`)", () => {
    const errs = semanticErrors("CREATE TABLE t(x) foo")
    expect(errs).toHaveLength(1)
    expect(errs[0]!.canonical).toBe("unknown table option: foo")
    expect(errs[0]!.token.text).toBe("foo")
  })

  test("accepts STRICT (case-insensitive)", () => {
    expect(semanticErrors("CREATE TABLE t(x) strict")).toHaveLength(0)
    expect(semanticErrors("CREATE TABLE t(x) STRICT")).toHaveLength(0)
  })
})

describe("table_option::WITHOUT nm  — parse.y:235", () => {
  test("rejects WITHOUT <not-rowid>", () => {
    const errs = semanticErrors("CREATE TABLE t(x) WITHOUT frobnicate")
    expect(errs).toHaveLength(1)
    expect(errs[0]!.canonical).toBe("unknown table option: frobnicate")
    expect(errs[0]!.token.text).toBe("frobnicate")
  })

  test("accepts WITHOUT ROWID (case-insensitive)", () => {
    expect(semanticErrors("CREATE TABLE t(x) WITHOUT rowid")).toHaveLength(0)
    expect(semanticErrors("CREATE TABLE t(x) WITHOUT ROWID")).toHaveLength(0)
  })
})

describe("tridxby::INDEXED BY nm  — parse.y:1786", () => {
  test("INDEXED BY inside trigger UPDATE is rejected", () => {
    const sql = "CREATE TRIGGER tr AFTER UPDATE ON t BEGIN UPDATE t INDEXED BY i SET x = 1; END"
    const errs = semanticErrors(sql)
    expect(errs).toHaveLength(1)
    expect(errs[0]!.canonical).toBe(
      "the INDEXED BY clause is not allowed on UPDATE or DELETE statements within triggers",
    )
  })

  test("INDEXED BY outside triggers is fine", () => {
    expect(semanticErrors("UPDATE t INDEXED BY i SET x = 1")).toHaveLength(0)
  })
})

describe("tridxby::NOT INDEXED  — parse.y:1791", () => {
  test("NOT INDEXED inside trigger DELETE is rejected", () => {
    const sql =
      "CREATE TRIGGER tr AFTER UPDATE ON t BEGIN DELETE FROM t NOT INDEXED WHERE x = 1; END"
    const errs = semanticErrors(sql)
    expect(errs).toHaveLength(1)
    expect(errs[0]!.canonical).toBe(
      "the NOT INDEXED clause is not allowed on UPDATE or DELETE statements within triggers",
    )
  })

  test("NOT INDEXED outside triggers is fine", () => {
    expect(semanticErrors("DELETE FROM t NOT INDEXED WHERE x = 1")).toHaveLength(0)
  })
})

describe("term::QNUMBER  — parse.y:2140", () => {
  const withSep = withOptions({ digitSeparator: "_" }).parse

  test("accepts well-formed digit-separated literals", () => {
    expect(semanticErrors("SELECT 1_000", withSep)).toHaveLength(0)
    expect(semanticErrors("SELECT 1_000_000.5", withSep)).toHaveLength(0)
    expect(semanticErrors("SELECT 0xDE_AD_BE_EF", withSep)).toHaveLength(0)
    expect(semanticErrors("SELECT 1e1_0", withSep)).toHaveLength(0)
  })

  test("rejects adjacent separators", () => {
    const errs = semanticErrors("SELECT 1__000", withSep)
    expect(errs).toHaveLength(1)
    expect(errs[0]!.canonical).toBe('unrecognized token: "1__000"')
  })

  test("rejects trailing separator", () => {
    const errs = semanticErrors("SELECT 1_", withSep)
    expect(errs).toHaveLength(1)
    expect(errs[0]!.canonical).toBe('unrecognized token: "1_"')
  })

  test("rejects separator adjacent to decimal point", () => {
    expect(semanticErrors("SELECT 1_.5", withSep)).toHaveLength(1)
    expect(semanticErrors("SELECT 1._5", withSep)).toHaveLength(1)
  })

  test("rejects trailing separator in exponent", () => {
    // `1e_5` is caught by the tokenizer as TK_ILLEGAL; this case is
    // one the tokenizer admits as QNUMBER for the semantic pass to
    // reject.
    expect(semanticErrors("SELECT 1e5_", withSep)).toHaveLength(1)
  })
})

describe("ASSERT_IS_CREATE entries", () => {
  // ccons::CONSTRAINT nm, tcons::CONSTRAINT nm, tconscomma::COMMA in
  // the snapshot are internal asserts on pParse->u1.cr state; they do
  // not produce user-visible errors.  These statements are valid.
  test("named CONSTRAINT clauses parse cleanly", () => {
    expect(semanticErrors("CREATE TABLE t(x INT CONSTRAINT c1 NOT NULL)")).toHaveLength(0)
    expect(semanticErrors("CREATE TABLE t(x INT, CONSTRAINT c1 CHECK (x > 0))")).toHaveLength(0)
  })
})
