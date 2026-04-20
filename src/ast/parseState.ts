// Parser-session types shared by the action-based parser (parse-ts.y →
// lemonpar2.ts) and its downstream helpers in parseActions.ts.
//
// The canonical shapes for source ranges and tokens live in
// `src/tokenize.ts`: `Span` is the position tuple every AST node
// carries, and `Token` is the runtime value the tokenizer yields
// (`type` + `text` + `span`).  This file re-exports them so AST-layer
// callers have a single import site.

import type { Span, Token } from "../tokenize.ts"
import type { ExplainKind, Name, Stmt } from "./nodes.ts"

export type { Span, Token }

/** One diagnostic produced by a parser action. */
export interface ParseError {
  readonly message: string
  /** Byte offset of the offending token, if known. */
  readonly start?: number
  /** Length of the offending token, if known. */
  readonly length?: number
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
  errors: ParseError[]
  /**
   * Digit-separator character used by the tokenizer.  The `term ::=
   * QNUMBER` action passes this to `sqlite3DequoteNumber` so separator
   * placement is validated with the same character the lexer accepted.
   * `undefined` falls back to util's default (`"_"`).
   */
  digitSeparator?: string
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
