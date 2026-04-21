import { describe, expect, test } from "bun:test"

import { parserModuleForGrammar } from "../src/parser.ts"
import { constants, tables, symbols, reduce, createState } from "../generated/3.54.0/parse.ts"
import type { KeywordDefs } from "../src/tokenize.ts"
import keywordDefs from "../generated/3.54.0/keywords.prod.json" with { type: "json" }

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
