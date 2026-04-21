// Tests for `parseStmt`: the single-statement convenience entry
// point modelled on sqlite3_prepare_v2.  Covers the default "strict
// consume" behaviour, the `allowTrailing` opt-out for walking a
// multi-statement script, the `tail` offset contract, and the
// degenerate "no statement" / error cases.

import { describe, expect, test } from "bun:test"

import { parseStmt } from "../generated/current.ts"

describe("parseStmt", () => {
  test("accepts a single statement and reports tail at end-of-input", () => {
    const sql = "SELECT 1"
    const r = parseStmt(sql)
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.root.type).toBe("SelectStmt")
    expect(r.tail).toBe(sql.length)
  })

  test("accepts a single statement with a trailing semicolon", () => {
    const sql = "SELECT 1;"
    const r = parseStmt(sql)
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.root.type).toBe("SelectStmt")
    expect(r.tail).toBe(sql.length)
  })

  test("accepts bare `;` separators after the statement", () => {
    const sql = "SELECT 1;;;"
    const r = parseStmt(sql)
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.tail).toBe(sql.length)
  })

  test("rejects a trailing second statement by default", () => {
    const sql = "SELECT 1; SELECT 2"
    const r = parseStmt(sql)
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.errors[0]?.message).toBe("expected end of input after single statement")
    const span = r.errors[0]!.span
    expect(span.offset).toBe(sql.indexOf("SELECT 2"))
    expect(span.offset + span.length).toBe(sql.length)
  })

  test("rejects trailing garbage tokens by default", () => {
    const sql = "SELECT 1; garbage"
    const r = parseStmt(sql)
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.errors[0]?.message).toBe("expected end of input after single statement")
  })

  describe("allowTrailing: true", () => {
    test("returns the first statement and tail at the trailing token", () => {
      const sql = "SELECT 1; SELECT 2"
      const r = parseStmt(sql, { allowTrailing: true })
      expect(r.status).toBe("ok")
      if (r.status !== "ok") return
      expect(r.root.type).toBe("SelectStmt")
      expect(r.tail).toBe(sql.indexOf("SELECT 2"))
      expect(sql.slice(r.tail)).toBe("SELECT 2")
    })

    test("iterative walk: repeatedly slicing by tail consumes every statement", () => {
      const sql = "SELECT 1; SELECT 2; SELECT 3"
      const consumed: string[] = []
      let rest = sql
      while (rest.length > 0) {
        const r = parseStmt(rest, { allowTrailing: true })
        expect(r.status).toBe("ok")
        if (r.status !== "ok") return
        consumed.push(r.root.type)
        // Guard against pathological no-progress loops.
        expect(r.tail).toBeGreaterThan(0)
        rest = rest.slice(r.tail).replace(/^[\s;]+/, "")
      }
      expect(consumed).toEqual(["SelectStmt", "SelectStmt", "SelectStmt"])
    })

    test("tail equals source.length when the input ends at the first statement", () => {
      const sql = "SELECT 1;"
      const r = parseStmt(sql, { allowTrailing: true })
      expect(r.status).toBe("ok")
      if (r.status !== "ok") return
      expect(r.tail).toBe(sql.length)
    })

    test("trailing garbage is ignored and tail points at it", () => {
      const sql = "SELECT 1; garbage here"
      const r = parseStmt(sql, { allowTrailing: true })
      expect(r.status).toBe("ok")
      if (r.status !== "ok") return
      expect(sql.slice(r.tail)).toBe("garbage here")
    })
  })

  test("empty input is an error (no statement)", () => {
    const r = parseStmt("")
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.errors[0]?.message).toBe("no SQL statement in input")
  })

  test("whitespace/comment-only input is an error (no statement)", () => {
    const r = parseStmt("   /* just a comment */  ")
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.errors[0]?.message).toBe("no SQL statement in input")
  })

  test("bare-semicolons-only input is an error (no statement)", () => {
    const r = parseStmt(";;;")
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.errors[0]?.message).toBe("no SQL statement in input")
  })

  test("syntax error inside the first statement surfaces normally", () => {
    const r = parseStmt("SELECT FROM t")
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    // Not the "no statement" message — a real syntax diagnostic.
    expect(r.errors[0]?.message).not.toBe("no SQL statement in input")
    expect(r.errors.length).toBeGreaterThan(0)
  })

  test("emitTokens still populates tokens on an allowTrailing stop", () => {
    const sql = "SELECT 1; SELECT 2"
    const r = parseStmt(sql, { allowTrailing: true, emitTokens: true })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.tokens).toBeDefined()
    // We stopped before feeding the second SELECT into the engine, so
    // the token stream runs through SEMI and no further.
    const types = r.tokens!.map((t) => t.type)
    expect(types.length).toBeGreaterThan(0)
  })
})
