import { describe, expect, test } from "bun:test"

import { parserModuleForGrammar } from "../src/parser.ts"
import { constants, tables, symbols, reduce, createState } from "../generated/3.53.0/parse.ts"
import type { KeywordDefs } from "../src/tokenize.ts"
import keywordDefs from "../generated/3.53.0/keywords.prod.json" with { type: "json" }

const mod = parserModuleForGrammar(
  { constants, tables, symbols, reduce, createState },
  keywordDefs as KeywordDefs,
  {},
)

function errored(sql: string) {
  const result = mod.parse(sql)
  expect(result.status).toBe("errored")
  if (result.status !== "errored")
    throw new Error(`expected errored result for ${JSON.stringify(sql)}`)
  return result
}

function firstHint(sql: string): string | undefined {
  return errored(sql).errors[0]?.hints?.[0]?.message
}

describe("syntax diagnostics", () => {
  test("trailing comma before clause boundary", () => {
    expect(firstHint("SELECT a, FROM t;")).toBe(
      'remove the trailing comma or add another list item before "FROM"',
    )
  })

  test("missing expression before FROM", () => {
    expect(firstHint("SELECT FROM FROM t;")).toBe("expected a result expression before FROM")
  })

  test("unmatched closing paren", () => {
    expect(firstHint("SELECT )")).toBe('unexpected ")" with no matching "("')
  })

  test("missing closing paren before clause boundary", () => {
    expect(firstHint("SELECT (1 FROM t;")).toBe('missing ")" before "FROM"')
  })

  test("FILTER after OVER", () => {
    expect(firstHint("SELECT sum(x) OVER () FILTER (WHERE x)")).toBe(
      "FILTER clauses must appear before OVER clauses",
    )
  })

  test("quoted-keyword identifier hint", () => {
    expect(firstHint("CREATE TABLE t(select INT);")).toBe(
      'if you intended "select" as an identifier here, quote it',
    )
  })
})

describe("lexical diagnostics", () => {
  test("sqlite-faithful raw token message plus escaped echo hint", () => {
    const result = errored('SELECT "abc')
    expect(result.errors[0]?.message).toBe('unrecognized token: ""abc"')
    expect(result.errors[0]?.hints?.map((hint) => hint.message)).toEqual([
      "unterminated quoted identifier",
      'escaped token text: "\\\"abc"',
    ])
  })
})

describe("error spans point at the offending token", () => {
  test("syntax error span covers the bad token", () => {
    const sql = "SELECT a, FROM t;"
    const [error] = errored(sql).errors
    // `FROM` is the trailing-clause-boundary that trips the diagnostic.
    expect(error!.span.offset).toBe(sql.indexOf("FROM"))
    expect(error!.span.length).toBe(4)
    expect(sql.slice(error!.span.offset, error!.span.offset + error!.span.length)).toBe("FROM")
  })

  test("unmatched `)` span covers just the paren", () => {
    const sql = "SELECT )"
    const [error] = errored(sql).errors
    expect(error!.span.offset).toBe(sql.indexOf(")"))
    expect(error!.span.length).toBe(1)
  })

  test("illegal-token span covers the full unterminated lexeme", () => {
    const sql = 'SELECT "abc'
    const [error] = errored(sql).errors
    const badStart = sql.indexOf('"')
    expect(error!.span.offset).toBe(badStart)
    expect(error!.span.length).toBe(sql.length - badStart)
  })

  test("line/col reflect multi-line input", () => {
    // A 3-line script where the error token is on line 2.
    const sql = "SELECT\n  ,\n  x"
    const [error] = errored(sql).errors
    expect(error!.span.line).toBe(2)
    // The comma is at column 2 (0-based), after two spaces of indent.
    expect(error!.span.col).toBe(2)
  })

  test("error format() renders the source caret under the bad token", () => {
    const sql = "SELECT )"
    const formatted = errored(sql).errors[0]!.format()
    // Must contain the caret pointer directly under the `)`.
    const lines = formatted.split("\n")
    const gutterLine = lines.find((l) => l.includes("SELECT )"))
    const caretLine = lines.find((l) => /^\s*│\s*\^+\s*$/.test(l))
    expect(gutterLine).toBeDefined()
    expect(caretLine).toBeDefined()
  })
})
