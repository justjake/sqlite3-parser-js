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
//
// ## Which snapshot entries have a handler
//
// Entries whose upstream action calls `sqlite3ErrorMsg` or
// `sqlite3DequoteNumber` produce user-facing errors and are ported
// below.
//
// Entries whose only validation pattern is `ASSERT_IS_CREATE` are
// internal C asserts on `pParse->u1.cr` state — they check parser
// bookkeeping, not user input, and have no user-visible behavior to
// port.  They remain in the snapshot so that if upstream ever
// replaces the assert with a real error, the drift check fires and
// forces a re-audit.

import { lineColAt, type ParseError } from "./enhanceError.ts"
import type { ParserDefs, RuleId } from "./lempar.ts"
import type { CstNode, RuleNode, TokenNode } from "./parser.ts"
import { sqlite3DequoteNumber } from "./util.ts"
import { buildSymbolName, stableKeyForRule, type StableKey } from "./ast/dispatch.ts"

export interface SemanticContext {
  readonly sql: string
  /**
   * Digit-separator character used by the tokenizer.  `undefined` falls
   * back to `sqlite3DequoteNumber`'s default (`"_"`).  Callers that
   * passed a non-default `digitSeparator` to the tokenizer must pass
   * the same value here.
   */
  readonly digitSeparator?: string
}

/**
 * Validate one reduction.  Return zero or more `ParseError`s for the
 * issues SQLite's `parse.y` action would raise.  Handlers see the
 * `RuleNode` the engine just built and can inspect its direct
 * children plus any deeper subtree.
 */
export type SemanticHandler = (cst: RuleNode, ctx: SemanticContext) => readonly ParseError[]

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function firstTokenLeaf(node: CstNode): TokenNode | undefined {
  if (node.kind === "token") return node.synthetic ? undefined : node
  for (const c of node.children) {
    const t = firstTokenLeaf(c)
    if (t) return t
  }
  return undefined
}

function lastTokenLeaf(node: CstNode): TokenNode | undefined {
  if (node.kind === "token") return node.synthetic ? undefined : node
  for (let i = node.children.length - 1; i >= 0; i--) {
    const t = lastTokenLeaf(node.children[i]!)
    if (t) return t
  }
  return undefined
}

function nmChildText(cst: RuleNode, nmIndex: number): TokenNode | undefined {
  const nmNode = cst.children[nmIndex]
  if (!nmNode) return undefined
  return firstTokenLeaf(nmNode)
}

function spanRange(cst: RuleNode): readonly [number, number] {
  const first = firstTokenLeaf(cst)
  const last = lastTokenLeaf(cst)
  if (!first || !last) return [0, 0]
  return [first.start, last.start + last.length]
}

function makeError(
  ctx: SemanticContext,
  token: TokenNode,
  canonical: string,
  hint: string,
  range: readonly [number, number] = [token.start, token.start + token.length],
): ParseError {
  const { line, col } = lineColAt(ctx.sql, range[0])
  return { token, canonical, hint, line, col, range, expected: [] }
}

// ---------------------------------------------------------------------------
// Handlers.
//
// Each key MUST match a `stableKey` entry in
// generated/<ver>/semantic-actions.snapshot.json.  The `ActionStableKey`
// union (generated from the current grammar) constrains the keys at
// compile time.
// ---------------------------------------------------------------------------

export const handlers: Partial<Record<StableKey, SemanticHandler>> = {
  // parse.y: `table_option ::= nm`
  //   if nm is "strict" (case-insensitive) → set TF_Strict; otherwise
  //   `sqlite3ErrorMsg(pParse, "unknown table option: %.*s", ...)`.
  "table_option::nm": (cst, ctx) => {
    const nm = firstTokenLeaf(cst)
    if (!nm) return []
    if (nm.text.toLowerCase() === "strict") return []
    return [
      makeError(
        ctx,
        nm,
        `unknown table option: ${nm.text}`,
        `the only bare table options SQLite recognizes are STRICT and WITHOUT ROWID`,
      ),
    ]
  },

  // parse.y: `table_option ::= WITHOUT nm`
  //   if nm is "rowid" (case-insensitive) → set TF_WithoutRowid;
  //   otherwise `sqlite3ErrorMsg(pParse, "unknown table option: %.*s", ...)`.
  "table_option::WITHOUT nm": (cst, ctx) => {
    const nm = nmChildText(cst, 1)
    if (!nm) return []
    if (nm.text.toLowerCase() === "rowid") return []
    return [
      makeError(
        ctx,
        nm,
        `unknown table option: ${nm.text}`,
        `the only valid form here is WITHOUT ROWID`,
      ),
    ]
  },

  // parse.y: `tridxby ::= INDEXED BY nm`
  //   always errors: "the INDEXED BY clause is not allowed on UPDATE
  //   or DELETE statements within triggers".
  "tridxby::INDEXED BY nm": (cst, ctx) => {
    const anchor = firstTokenLeaf(cst)
    if (!anchor) return []
    return [
      makeError(
        ctx,
        anchor,
        "the INDEXED BY clause is not allowed on UPDATE or DELETE statements within triggers",
        "remove the INDEXED BY clause; SQLite plans indexes automatically inside triggers",
        spanRange(cst),
      ),
    ]
  },

  // parse.y: `tridxby ::= NOT INDEXED`
  //   always errors: "the NOT INDEXED clause is not allowed on UPDATE
  //   or DELETE statements within triggers".
  "tridxby::NOT INDEXED": (cst, ctx) => {
    const anchor = firstTokenLeaf(cst)
    if (!anchor) return []
    return [
      makeError(
        ctx,
        anchor,
        "the NOT INDEXED clause is not allowed on UPDATE or DELETE statements within triggers",
        "remove the NOT INDEXED clause; SQLite plans indexes automatically inside triggers",
        spanRange(cst),
      ),
    ]
  },

  // parse.y: `term ::= QNUMBER`
  //   `sqlite3DequoteNumber` strips separators and validates that
  //   every one sits between two digits (hex digits for `0x…`).
  //   The tokenizer accepts any separator run once it has seen a
  //   digit, so placement validation happens here.
  "term::QNUMBER": (cst, ctx) => {
    const tok = firstTokenLeaf(cst)
    if (!tok) return []
    const result = sqlite3DequoteNumber(tok.text, { digitSeparator: ctx.digitSeparator })
    if (!result.error) return []
    return [
      makeError(
        ctx,
        tok,
        result.error,
        `digit separators must sit between two digits (e.g. 1_000, 0xDE_AD)`,
      ),
    ]
  },
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/**
 * Walk a CST and collect every `ParseError` the registered handlers
 * report.  Returns an empty array when no handler matches any rule in
 * the tree.
 */
export function validate(
  cst: CstNode,
  defs: Pick<ParserDefs, "rules" | "symbols">,
  sql: string,
): ParseError[] {
  if (cst.kind === "token") return []
  const symbolName = buildSymbolName(defs)
  const ctx: SemanticContext = { sql }
  const errors: ParseError[] = []

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
