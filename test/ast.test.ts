import { describe, expect, test } from "bun:test"

import keywordDefs from "../generated/3.54.0/keywords.prod.json" with { type: "json" }
import parserDefs from "../generated/3.54.0/parser.prod.json" with { type: "json" }
import {
  buildSymbolName,
  createAstBuilder,
  handlers,
  stableKeyForRule,
  verifyHandlers,
} from "../src/ast/index.ts"
import type { ParserDefs } from "../src/lempar.ts"
import type { RuleNode } from "../src/parser.ts"
import { parserModuleForGrammar } from "../src/parser.ts"
import type { KeywordDefs } from "../src/tokenize.ts"

const PARSER_DEFS = parserDefs as unknown as ParserDefs
const KEYWORD_DEFS = keywordDefs as unknown as KeywordDefs

describe("AST scaffolding", () => {
  test("handler table matches the current grammar", () => {
    const verification = verifyHandlers(PARSER_DEFS, handlers)

    expect(verification.duplicateRuleKeys).toEqual([])
    expect(verification.unknownHandlerKeys).toEqual([])
    expect(new Set(verification.allRuleKeys).size).toBe(PARSER_DEFS.rules.length)
  })

  test("default builder falls back to Unknown for unhandled rules", () => {
    const parser = parserModuleForGrammar(PARSER_DEFS, KEYWORD_DEFS)
    const { cst, errors } = parser.parse("SELECT 1")
    expect(errors).toEqual([])
    expect(cst).toBeDefined()
    expect(cst?.kind).toBe("rule")

    const root = cst as RuleNode

    const builder = createAstBuilder(PARSER_DEFS)
    const result = builder.build(root, "SELECT 1")
    const symbolName = buildSymbolName(PARSER_DEFS)

    expect(result.errors).toEqual([])
    expect(result.ast?.kind).toBe("Unknown")
    expect(result.ast?.stableKey).toBe(stableKeyForRule(PARSER_DEFS.rules[root.rule]!, symbolName))
  })

  test("strict mode throws on an unhandled rule", () => {
    const parser = parserModuleForGrammar(PARSER_DEFS, KEYWORD_DEFS)
    const { cst, errors } = parser.parse("SELECT 1")
    expect(errors).toEqual([])
    expect(cst).toBeDefined()
    expect(cst?.kind).toBe("rule")

    const root = cst as RuleNode

    const builder = createAstBuilder(PARSER_DEFS, handlers, { strict: true })
    expect(() => builder.build(root, "SELECT 1")).toThrow(/No AST handler/)
  })
})
