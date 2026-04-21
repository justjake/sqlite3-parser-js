// Tests for `parseOrThrow` / `parseStmtOrThrow`: the throw-on-error
// wrappers around `parse` / `parseStmt`.  They delegate to the
// underlying functions on success and raise `Sqlite3ParserDiagnosticError`
// (carrying the diagnostics verbatim) on failure.

import { describe, expect, test } from "bun:test"

import {
  parse,
  parseStmt,
  parseOrThrow,
  parseStmtOrThrow,
  Sqlite3ParserDiagnosticError,
  Sqlite3ParserError,
} from "../generated/current.ts"

describe("parseOrThrow", () => {
  test("returns the same ok shape as parse on valid input", () => {
    const sql = "SELECT 1"
    const result = parseOrThrow(sql)
    expect(result.root.type).toBe("CmdList")
    expect(result.tokens).toBeUndefined()
  })

  test("forwards emitTokens into the returned result", () => {
    const result = parseOrThrow("SELECT 1", { emitTokens: true })
    expect(Array.isArray(result.tokens)).toBe(true)
    expect(result.tokens!.length).toBeGreaterThan(0)
  })

  test("throws Sqlite3ParserDiagnosticError on a syntax error", () => {
    expect(() => parseOrThrow("SELECT FROM t")).toThrow(Sqlite3ParserDiagnosticError)
  })

  test("thrown error carries the same diagnostics as parse would return", () => {
    const sql = "SELECT FROM t"
    const parsed = parse(sql)
    expect(parsed.status).toBe("error")
    if (parsed.status !== "error") return

    let caught: unknown
    try {
      parseOrThrow(sql)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Sqlite3ParserDiagnosticError)
    expect(caught).toBeInstanceOf(Sqlite3ParserError)
    const err = caught as Sqlite3ParserDiagnosticError
    expect(err.errors).toEqual(parsed.errors)
    // Single-diagnostic constructor path: message is the formatted diagnostic.
    expect(err.message).toBe(parsed.errors[0]!.format())
  })

  test("filename flows through into thrown diagnostics", () => {
    let caught: unknown
    try {
      parseOrThrow("SELECT FROM t", { filename: "query.sql" })
    } catch (e) {
      caught = e
    }
    const err = caught as Sqlite3ParserDiagnosticError
    expect(err.errors[0]!.filename).toBe("query.sql")
  })
})

describe("parseStmtOrThrow", () => {
  test("returns the same ok shape as parseStmt on valid input", () => {
    const sql = "SELECT 1;"
    const result = parseStmtOrThrow(sql)
    expect(result.root.type).toBe("SelectStmt")
    expect(result.tail).toBe(sql.length)
  })

  test("honours allowTrailing and returns tail at the trailing token", () => {
    const sql = "SELECT 1; SELECT 2"
    const result = parseStmtOrThrow(sql, { allowTrailing: true })
    expect(result.root.type).toBe("SelectStmt")
    expect(result.tail).toBe(sql.indexOf("SELECT 2"))
  })

  test("throws on a trailing second statement by default", () => {
    expect(() => parseStmtOrThrow("SELECT 1; SELECT 2")).toThrow(Sqlite3ParserDiagnosticError)
  })

  test("throws on the no-statement input (whitespace/comments only)", () => {
    let caught: unknown
    try {
      parseStmtOrThrow("   /* comment */  ")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Sqlite3ParserDiagnosticError)
    const err = caught as Sqlite3ParserDiagnosticError
    expect(err.errors[0]!.message).toBe("no SQL statement in input")
  })

  test("thrown error carries the same diagnostics as parseStmt would return", () => {
    const sql = "SELECT FROM t"
    const parsed = parseStmt(sql)
    expect(parsed.status).toBe("error")
    if (parsed.status !== "error") return

    let caught: unknown
    try {
      parseStmtOrThrow(sql)
    } catch (e) {
      caught = e
    }
    const err = caught as Sqlite3ParserDiagnosticError
    expect(err.errors).toEqual(parsed.errors)
  })
})
