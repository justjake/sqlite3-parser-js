// AST node types.
//
// Scaffolding only.  Nothing here is final — the concrete variant set
// will grow as handlers in ./handlers.ts get implemented.  For now we
// ship a single fallback variant so the dispatcher type-checks
// end-to-end.
//
// Design intent (see AST_DESIGN_IDEAS.md):
// - AST nodes are our own shape, NOT a mirror of SQLite's internal IR.
// - Every AST node preserves a `cst` back-pointer so callers can recover
//   source spans without a second parse.  Handlers attach this in their
//   return values; the {@link BaseAstNode} interface below is the common shape.

import type { CstNode, RuleNode } from "../parser.ts"

/**
 * Fields common to every AST node.  Handlers should spread this into
 * their return values so we never lose the provenance CST pointer.
 */
export interface BaseAstNode {
  /** Discriminant.  Extended by each concrete variant below. */
  readonly kind: string
  /** The CST node this was built from.  Source range is `cst.start`/`cst.length`. */
  readonly cst: RuleNode
}

/**
 * Fallback variant for rules that don't yet have a handler.  Lets the
 * dispatcher produce a total result even while coverage is incomplete.
 * Downstream code can detect this and fall back to CST-based rendering.
 */
export interface UnknownAstNode extends BaseAstNode {
  readonly kind: "Unknown"
  /** The rule's stable key (for diagnostics / coverage). */
  readonly stableKey: string
}

/**
 * The discriminated union of all AST nodes.  Grows as handlers land;
 * for now it's just the fallback.
 */
export type AstNode = UnknownAstNode

/**
 * An error raised during CST→AST conversion.  Distinct from
 * `ParseError` (in ../parser.ts): parse errors come from the LALR
 * engine; AST errors
 * come from handlers (e.g. "this CST is syntactically valid but the
 * combination it expresses is semantically ill-formed").
 */
export interface AstError {
  readonly message: string
  /** The CST node that triggered the error, if applicable. */
  readonly cst?: CstNode
}

export interface AstResult {
  /** Present iff conversion produced a root node. */
  readonly ast?: AstNode
  readonly errors: readonly AstError[]
}
