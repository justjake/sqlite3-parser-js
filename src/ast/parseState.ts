// Parser-session types shared by the action-based parser (parse.y →
// generated/<ver>/parse.ts) and its downstream helpers in parseActions.ts.
//
// `Span` (position tuple every AST node carries) and `Token` (the
// tokenizer's runtime value — `type` + `text` + `span`) are defined in
// `src/tokenize.ts` and imported here by the types that need them.

import type { Span, Token } from "../tokenize.ts"
import type { Cmd, ExplainKind, Name, Stmt } from "./nodes.ts"

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
    readonly span: Span | undefined
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
  /**
   * The statement currently being built by the active `cmd ::= …` rule.
   * `flushCmd` reads it (together with `explain`) at each `ecmd ::= … SEMI`
   * reduction, wraps it into a {@link Cmd}, pushes it onto `cmds`, and
   * clears this slot for the next statement.
   */
  stmt: Stmt | undefined
  /**
   * `EXPLAIN` / `EXPLAIN QUERY PLAN` prefix for the pending statement, set
   * by the explain rules and consumed by `flushCmd` alongside `stmt`.
   */
  explain: ExplainKind | undefined
  /**
   * Accumulated, reduced commands in source order.  Each `ecmd ::= cmdx
   * SEMI` (and its explain-prefixed twin) runs `flushCmd`, which converts
   * the pending `stmt` into a {@link Cmd} and pushes it here.
   */
  cmds: Cmd[]
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
    cmds: [],
    constraintName: undefined,
    vtabArgs: [],
    vtabArgCurrent: "",
    errors: [],
  }
}
