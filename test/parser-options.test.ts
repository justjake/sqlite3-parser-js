// Tests for parser-level options: `singleStatement` (reject multi-stmt
// input) and `emitTokens` (attach the fed token stream to the result).

import { describe, expect, test } from "bun:test"

import { parse, withOptions, tokenName } from "../generated/current.ts"

const single = withOptions({ singleStatement: true })

describe("singleStatement option", () => {
  test("accepts a single statement without a trailing semicolon", () => {
    const r = single.parse("SELECT 1")
    expect(r.status).toBe("ok")
  })

  test("accepts a single statement with a trailing semicolon", () => {
    const r = single.parse("SELECT 1;")
    expect(r.status).toBe("ok")
  })

  test("accepts a single statement followed by bare `;` separators", () => {
    const r = single.parse("SELECT 1;;;;")
    expect(r.status).toBe("ok")
  })

  test("rejects a second real statement after the first", () => {
    const r = single.parse("SELECT 1; SELECT 2")
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.errors[0]?.message).toBe("expected end of input after single statement")
  })

  test("error span covers from the trailing token to end of input", () => {
    const sql = "SELECT 1; SELECT 2"
    const r = single.parse(sql)
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    const span = r.errors[0]!.span
    // The trailing `SELECT` starts at offset 10.
    expect(span.offset).toBe(10)
    expect(span.offset + span.length).toBe(sql.length)
  })

  test("default parser (no option) accepts multi-statement input", () => {
    const r = parse("SELECT 1; SELECT 2")
    expect(r.status).toBe("ok")
  })
})

describe("emitTokens option", () => {
  test("tokens omitted by default on accepted result", () => {
    const r = parse("SELECT 1")
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.tokens).toBeUndefined()
  })

  test("accepted result carries the non-trivia token stream", () => {
    const r = parse("SELECT 1 + 2", { emitTokens: true })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    const names = r.tokens!.map((t) => tokenName(t.type))
    // SPACE/COMMENT trivia is filtered; SEMI/EOF markers are appended
    // synthetically by the parser when the user didn't write a ';'.
    expect(names.slice(0, 4)).toEqual(["SELECT", "INTEGER", "PLUS", "INTEGER"])
    expect(r.tokens!.at(-2)?.synthetic).toBe(true)
    expect(r.tokens!.at(-1)?.synthetic).toBe(true)
    expect(tokenName(r.tokens!.at(-2)!.type)).toBe("SEMI")
  })

  test("no synthetic SEMI when the source already terminates with one", () => {
    const r = parse("SELECT 1;", { emitTokens: true })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    const lastReal = r.tokens!.at(-2)! // before the EOF marker
    expect(lastReal.synthetic).toBeUndefined()
    expect(tokenName(lastReal.type)).toBe("SEMI")
    expect(lastReal.text).toBe(";")
  })

  test("token texts and spans match the source", () => {
    const sql = "SELECT foo"
    const r = parse(sql, { emitTokens: true })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    const [sel, id] = r.tokens!
    expect(sel?.text).toBe("SELECT")
    expect(sel?.span.offset).toBe(0)
    expect(sel?.span.length).toBe(6)
    expect(id?.text).toBe("foo")
    expect(id?.span.offset).toBe(7)
    expect(id?.span.length).toBe(3)
  })

  test("errored result also carries the tokens seen before failure", () => {
    const r = parse("SELECT )", { emitTokens: true })
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    expect(r.tokens).toBeDefined()
    const names = r.tokens!.map((t) => tokenName(t.type))
    expect(names).toEqual(["SELECT", "RP"])
  })

  test("errored ILLEGAL-token result includes the ILLEGAL token itself", () => {
    const r = parse('SELECT "abc', { emitTokens: true })
    expect(r.status).toBe("error")
    if (r.status !== "error") return
    const names = r.tokens!.map((t) => tokenName(t.type))
    expect(names).toEqual(["SELECT", "ILLEGAL"])
  })
})
