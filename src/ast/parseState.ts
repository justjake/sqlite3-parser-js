// Parser-session types shared by the action-based parser (parse.y →
// generated/<ver>/parse.ts) and its downstream helpers in parseActions.ts.
//
// `Span` (position tuple every AST node carries) is defined in
// `src/tokenize.ts`. Shared diagnostics live in `src/diagnostics.ts`.

import type { Diagnostic } from "../diagnostics.ts"
import type { Name, Stmt } from "./nodes.ts"

/**
 * Explain prefix tracked on {@link ParseState} between the `explain`
 * reduction and the subsequent `ecmd ::= explain cmdx SEMI` flush.
 * Consumed by `flushCmd` to decide whether to wrap the pending
 * statement in an `ExplainStmt`.
 */
export type ExplainKind = "Explain" | "QueryPlan"

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
   * reduction, optionally wraps it in an `ExplainStmt`, pushes it onto
   * `cmds`, and clears this slot for the next statement.
   */
  stmt: Stmt | undefined
  /**
   * `EXPLAIN` / `EXPLAIN QUERY PLAN` prefix for the pending statement, set
   * by the explain rules and consumed by `flushCmd` alongside `stmt`.
   */
  explain: ExplainKind | undefined
  /**
   * Accumulated, reduced statements in source order.  Each `ecmd ::=
   * cmdx SEMI` (and its explain-prefixed twin) runs `flushCmd`, which
   * pushes the pending `stmt` (optionally `ExplainStmt`-wrapped) here.
   */
  cmds: Stmt[]
  /** Scratch slot holding the current CREATE TABLE constraint name. */
  constraintName: Name | undefined
  /** Accumulated virtual-table module args (one per vtabarg). */
  vtabArgs: string[]
  /** Scratch buffer for the current vtabarg, flushed between args. */
  vtabArgCurrent: string
  /** Diagnostics emitted by parser actions. */
  errors: Diagnostic[]
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
 * the parsed {@link Stmt} (or `undefined` if the parse didn't reach
 * accept) with both syntactic errors (pushed in by the LalrEngine
 * wrapper) and semantic errors (pushed by reducer actions).
 */
export interface ParseResult {
  readonly cmd: Stmt | undefined
  readonly errors: readonly Diagnostic[]
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
