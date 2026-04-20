// Parser-session types shared by the action-based parser (parse-ts.y →
// lemonpar2.ts) and its downstream helpers in parseActions.ts.
//
// The canonical shapes for source ranges and tokens live in
// `src/tokenize.ts`: `Span` is the position tuple every AST node
// carries, and `Token` is the runtime value the tokenizer yields
// (`type` + `text` + `span`).  This file re-exports them so AST-layer
// callers have a single import site.

import type { Span, Token } from "../tokenize.ts"
import type { Cmd, ExplainKind, Name, Stmt } from "./nodes.ts"

export type { Span, Token }

/**
 * One semantic diagnostic produced by an AST-building parser action.
 *
 * The name emphasises that these are AST-layer findings (duplicate
 * column names, DISTINCT-arity violations, misplaced digit separators,
 * etc.) — distinct from syntax errors raised by the LALR engine, which
 * travel on {@link engineModuleForGrammar}'s own error channel.  The
 * driver merges both streams into a single `errors` array on the
 * public {@link ParseResult}.
 */
export interface AstParseError {
  readonly message: string
  readonly span: Span
  /**
   * Secondary diagnostic pointers.  Useful for "duplicate name"-style
   * errors where we want to call out where the first declaration lives
   * in addition to the conflicting one, or for "unclosed LP" where we
   * want to highlight the opener alongside the missing closer.
   */
  readonly hints?: ReadonlyArray<{
    readonly message: string
    readonly span: Span
  }>
}

/**
 * Parser session state.  One instance per parse; threaded through every
 * action via the `%extra_context` hook.  Mirrors SQLite's `Parse*`
 * struct in role (it's where side-effecting actions deposit their
 * output), though the fields are far fewer because we don't do
 * codegen — only AST construction.
 */
export interface ParseState {
  /** The parsed top-level statement, set by whichever `cmd ::= …` rule fired. */
  stmt: Stmt | undefined
  /** `EXPLAIN` / `EXPLAIN QUERY PLAN` prefix, set by the explain rules. */
  explain: ExplainKind | undefined
  /** Scratch slot holding the current CREATE TABLE constraint name. */
  constraintName: Name | undefined
  /** Accumulated virtual-table module args (one per vtabarg). */
  vtabArgs: string[]
  /** Scratch buffer for the current vtabarg, flushed between args. */
  vtabArgCurrent: string
  /** Diagnostics emitted by parser actions. */
  errors: AstParseError[]
  /**
   * Digit-separator character used by the tokenizer.  The `term ::=
   * QNUMBER` action passes this to `sqlite3DequoteNumber` so separator
   * placement is validated with the same character the lexer accepted.
   * `undefined` falls back to util's default (`"_"`).
   */
  digitSeparator?: string
}

/**
 * Result returned by the AST parser's `parseTokens` driver.  Combines
 * the parsed {@link Cmd} (or `undefined` if the parse didn't reach
 * accept) with both syntactic errors (pushed in by the LalrEngine
 * wrapper) and semantic errors (pushed by reducer actions).
 */
export interface ParseResult {
  readonly cmd: Cmd | undefined
  readonly errors: readonly AstParseError[]
}

/** Allocate a fresh {@link ParseState} for a new parse session. */
export function makeParseState(): ParseState {
  return {
    stmt: undefined,
    explain: undefined,
    constraintName: undefined,
    vtabArgs: [],
    vtabArgCurrent: "",
    errors: [],
  }
}
