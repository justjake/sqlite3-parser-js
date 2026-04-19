// Parse-time validation ported from SQLite's parse.y semantic actions.
//
// The LALR driver builds a CST by running rule reductions, but the
// C action bodies attached to those rules in parse.y — the ones that
// call `sqlite3ErrorMsg()`, `sqlite3DequoteNumber()`, or assert
// `ASSERT_IS_CREATE` — never execute here.  That gap means some SQL
// upstream SQLite rejects at parse time is accepted by this parser
// unless the check is ported into a handler below.
//
// The set of rules carrying such actions is hashed into
// `generated/<ver>/semantic-actions.snapshot.json`.  The Makefile
// `check-semantic-actions` target fails the build when upstream drift
// changes an action body without a matching edit here, so the gap
// never widens silently.  See `scripts/semantic-snapshot.ts`.

import type { ParserDefs, RuleId } from "./lempar.ts"
import type { CstNode, RuleNode, TokenNode } from "./parser.ts"
import { buildSymbolName, stableKeyForRule, type StableKey } from "./ast/dispatch.ts"

/**
 * A semantic-validation finding.  Shaped after `ParseError` in
 * `enhanceError.ts` but carries only the fields a CST walk can
 * populate — no parser state, no expected-terminal list.  Callers
 * merge these into the main `ParseError[]` stream.
 */
export interface SemanticError {
  readonly token: TokenNode
  readonly canonical: string
  readonly hint: string
  readonly range: readonly [number, number]
}

export interface SemanticContext {
  readonly sql: string
}

/**
 * Validate one reduction.  Return zero or more `SemanticError`s for
 * the issues SQLite's `parse.y` action would raise.
 */
export type SemanticHandler = (cst: RuleNode, ctx: SemanticContext) => readonly SemanticError[]

/**
 * Map of grammar-shape stable key to semantic-validation handler.
 * Keys MUST correspond to entries in the committed semantic-actions
 * snapshot; the build-time check enforces that every snapshot entry
 * is either handled here or explicitly left unhandled.
 *
 * Empty by default: each handler is added alongside its test case in
 * `test/semantic-gaps.test.ts` and the snapshot entry that motivated
 * it.
 */
export const handlers: Partial<Record<StableKey, SemanticHandler>> = {}

/**
 * Walk a CST and collect every `SemanticError` the registered handlers
 * report.  Returns an empty array when no handler matches any rule in
 * the tree.
 */
export function validate(
  cst: CstNode,
  defs: Pick<ParserDefs, "rules" | "symbols">,
  sql: string,
): SemanticError[] {
  if (cst.kind === "token") return []
  const symbolName = buildSymbolName(defs)
  const ctx: SemanticContext = { sql }
  const errors: SemanticError[] = []

  const walk = (node: CstNode): void => {
    if (node.kind === "token") return
    const rule = defs.rules[node.rule as RuleId]
    if (rule) {
      const handler = handlers[stableKeyForRule(rule, symbolName) as StableKey]
      if (handler) errors.push(...handler(node, ctx))
    }
    for (const child of node.children) walk(child)
  }

  walk(cst)
  return errors
}
