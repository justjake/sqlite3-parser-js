// AST-building SQL parser.
//
// This module is the orchestration layer above src/lempar.ts (the pure
// LALR driver). It tokenizes source text, feeds terminals into the
// engine, lets the generated reducer build AST state, and merges
// low-level diagnostics into the public ParseError API.

import {
  type TokenizeOptions,
  tokenizerModuleForGrammar,
  type Token,
  type TokenIterator,
  type CreateTokenizerOptions,
  type KeywordDefs,
} from "./tokenize.ts"
import {
  engineModuleForGrammar,
  type ParserDefs,
  type TokenId,
  type LalrReduce,
  type CreateLalrEngine,
} from "./lempar.ts"
import {
  bindSyntaxDiagnostics,
  buildIllegalTokenDiagnostic,
  createParseDiagnosticArray,
  type Diagnostic,
  type ParseDiagnostic,
} from "./diagnostics.ts"
import { Sqlite3ParserDiagnosticError } from "./errors.ts"
import type { CmdList, Stmt } from "./ast/nodes.ts"
import { finalizeCmdList } from "./ast/parseActions.ts"
import type { ParseState } from "./ast/parseState.ts"

/** Options for a parser module.  Tokenizer-level options are forwarded verbatim. */
export interface CreateParserOptions extends CreateTokenizerOptions {
  /**
   * Reject input containing more than one top-level SQL statement.  When
   * set, the parser stops at the first statement's terminating `SEMI`
   * and, if any further tokens (other than additional bare `;`
   * separators) remain, returns `{status: "error"}` with a single
   * `ParseError` whose span covers from the first trailing token to
   * end-of-input.  Useful for contexts like `prepare_v2`-style call sites
   * where only one statement is meaningful.  Defaults to `false`.
   */
  readonly singleStatement?: boolean
}

export type ParseOk = {
  status: "ok"
  root: CmdList
  errors?: undefined
  tokens?: Token[]
}
export type ParseErr = {
  status: "error"
  errors: readonly ParseDiagnostic[]
  tokens?: Token[]
}
/** Return type of {@link ParserModule.parse} */
export type ParseResult = ParseOk | ParseErr

export type ParseStmtOk = {
  status: "ok"

  /** The first top-level statement parsed from the input. */
  root: Stmt

  /**
   * Index into the source string (in JS string units, same as
   * `source.slice`) past the terminating `;` of the parsed
   * statement — or `source.length` if the statement ran to the end
   * of input without a trailing `;`.  Analogous to SQLite's
   * `sqlite3_prepare_v2` `pzTail` out-parameter: callers that want
   * to walk a multi-statement script pass `source.slice(tail)`
   * back through `parseStmt` until `tail === source.length`.
   */
  tail: number
  errors?: undefined
  tokens?: Token[]
}
export type ParseStmtErr = {
  status: "error"
  errors: readonly ParseDiagnostic[]
  tokens?: Token[]
}
/** Return type of {@link ParserModule.parseStmt}. */
export type ParseStmtResult = ParseStmtOk | ParseStmtErr

// ---------------------------------------------------------------------------
// parserModuleForGrammar — bind the driver to a specific
// parser.json + keywords.json.
// ---------------------------------------------------------------------------

export type ParseOptions = TokenizeOptions & {
  /** Annotate any returned errors with this filename. */
  filename?: string
  /**
   * When `true`, the returned result carries a `tokens` field — the
   * chronological stream of non-trivia tokens the parser fed the
   * engine, including any synthetic SEMI / EOF markers appended at the
   * tail.  Populated on both `"ok"` and `"error"` results.
   */
  emitTokens?: boolean
}

/** Options for {@link ParserModule.parseStmt}. */
export type ParseStmtOptions = ParseOptions & {
  /**
   * By default, `parseStmt` returns `{status: "error"}` if the
   * first statement is followed by any non-trivia content (a second
   * statement, garbage tokens, …) — it's strict about consuming the
   * whole input.  Set `allowTrailing: true` to ignore trailing content
   * instead, returning its start offset as `tail`.  Useful for walking
   * a multi-statement script one statement at a time.  Bare `;`
   * separators are always allowed regardless.
   */
  allowTrailing?: boolean
}

/**
 * SQLite3 Parser library.
 */
export interface ParserModule {
  /** Parse a SQL string into an AST. */
  parse(source: string, opts?: ParseOptions): ParseResult
  /** Parse a SQL string into an AST, or throw if parse errors occur. */
  parseOrThrow(source: string, opts?: ParseOptions): { root: CmdList; tokens?: Token[] }
  /**
   * Parse exactly one top-level SQL statement from `source`.
   *
   * If `allowTrailing` is `true`, returns ok and the string index of the first token of the next statement.
   * If `allowTrailing` is unset or `false`, returns a diagnostic if there are any tokens after the first statement.
   */
  parseStmt(source: string, opts?: ParseStmtOptions): ParseStmtResult
  /**
   * Parse exactly one top-level SQL statement from `source`, see {@link parseStmt} for more details.
   * Throws if parse errors occur.
   */
  parseStmtOrThrow(
    source: string,
    opts?: ParseStmtOptions,
  ): { root: Stmt; tail: number; tokens?: Token[] }
  /** Tokenize a SQL string into a stream of tokens. */
  tokenize(source: string, opts?: TokenizeOptions): TokenIterator
  /** Look up the display name of a token-id, e.g. `TokenId(1) → "SEMI"`. */
  tokenName(code: TokenId): string | undefined
  /** Create the underlying LALR state machine engine, used by {@link parse}. */
  createEngine: CreateLalrEngine
  /** Reducer function that evaluates parse rules to build the AST. */
  reduce: LalrReduce<ParseState, unknown>
  /** Create a new parse state for use with {@link createEngine}.. */
  createState: () => ParseState
  /**
   * Create a new parser module with the given options.
   * Parser modules are stateless, you should create one at module scope and reuse it.
   */
  withOptions(opts: CreateParserOptions): ParserModule
  /** LALR parser definition. */
  parserDefs: ParserDefs<ParseState, unknown>
  /** SQLite keywords recognized by the tokenizer. */
  keywordDefs: KeywordDefs
}

/**
 * Create a Parser for the grammar specified by `parserDefs` and `keywordDefs`.
 */
export function parserModuleForGrammar(
  parserDefs: ParserDefs<ParseState, unknown>,
  keywordDefs: KeywordDefs,
  options: CreateParserOptions,
): ParserModule {
  const { reduce, createState } = parserDefs
  const tk = tokenizerModuleForGrammar(parserDefs, keywordDefs, options)
  const createEngine = engineModuleForGrammar(parserDefs)
  const buildSyntaxError = bindSyntaxDiagnostics(parserDefs, keywordDefs)

  const { CASE, COMMENT, END, ILLEGAL, LP, RP, SEMI, SPACE } = tk.tokens
  const FILTER = requireTokenId(parserDefs, "FILTER")
  const OVER = requireTokenId(parserDefs, "OVER")
  const EOF = 0 as TokenId

  // -------------------------------------------------------------------------
  // parse / parseStmt — public entry points.
  //
  // Both are thin wrappers over `runCore`, which tokenises the input,
  // feeds it to the engine as a lazy iterable of `{major, value}`
  // pairs, and returns an intermediate outcome (populated ParseState +
  // tail offset, or a diagnostic list).
  // -------------------------------------------------------------------------

  type CoreMode = {
    /** Stop after the first statement commits instead of consuming to EOF. */
    firstStatement: boolean
    /** Error on any non-trivia content past the first statement. */
    rejectTrailing: boolean
  }

  type CoreOutcome =
    | {
        ok: true
        state: ParseState
        /**
         * In `firstStatement` mode: offset of the first trailing
         * non-trivia token, or `sql.length` if the input ended without
         * one.  In full mode: `sql.length`.
         */
        tail: number
        tokens: Token[] | undefined
      }
    | {
        ok: false
        errors: readonly ParseDiagnostic[]
        tokens: Token[] | undefined
      }

  function runCore(sql: string, opts: ParseOptions, mode: CoreMode): CoreOutcome {
    const { filename, emitTokens, ...tokenizeOptions } = opts
    const errorContext = { source: sql, filename }
    const diagnostics: Diagnostic[] = []

    // When `emitTokens` is set, accumulate every non-trivia token seen
    // during this parse — including any ILLEGAL token that aborted and
    // the tail-synthetic SEMI/EOF markers — for attachment to the
    // result.  Left `undefined` when the flag is off so the hot loop
    // pays only a single predictable branch per token.
    const tokens: Token[] | undefined = emitTokens ? [] : undefined

    // Structurally the same shape as sqlite's tokenize.c:674
    // sqlite3RunParser: get a token, feed it to the parser, repeat
    // until end-of-input or error; then inject a virtual SEMI (if the
    // last real token wasn't one) and the `$` end marker.
    const state = createState()
    const session = createEngine(reduce, state)

    // Open-delimiter stack, maintained in lockstep with the dispatch
    // loop.  Lets `buildSyntaxError` point at the unmatched opener
    // without retaining full token history.  END is shared between
    // CASE/END and (future) BEGIN/END blocks, so we peek the top to
    // decide whether a close matches — a pure close-token lookup would
    // misbehave.  Only the opener Token is retained; the pair is
    // implicit in its type.
    const openers: Token[] = []
    let previousToken: Token | undefined
    let sawOverSinceLastFilterOrSemi = false

    function syntaxErrorResult(token: Token): CoreOutcome {
      const error = session.errors[session.errors.length - 1]
      diagnostics.push(
        buildSyntaxError({
          token,
          state: error!.stateno,
          previousToken,
          openers,
          sawOverSinceLastFilterOrSemi,
        }),
      )
      diagnostics.push(...state.errors)
      return {
        ok: false,
        errors: createParseDiagnosticArray(errorContext, diagnostics),
        tokens,
      }
    }

    function noteSuccessfulToken(token: Token): void {
      const type = token.type
      if (type === LP || type === CASE) {
        openers.push(token)
      } else if (type === RP || type === END) {
        const top = openers[openers.length - 1]
        if (top && ((top.type === LP && type === RP) || (top.type === CASE && type === END))) {
          openers.pop()
        }
      }

      if (type === OVER) sawOverSinceLastFilterOrSemi = true
      else if (type === FILTER || type === SEMI) sawOverSinceLastFilterOrSemi = false

      previousToken = token
      lastMajor = type
    }

    // Trailing-content tripwire: the `ecmd ::= cmdx SEMI` reduction
    // that bumps `state.cmds` from 0 to 1 is deferred by LALR lookahead
    // — it fires when we feed the token *after* the terminating SEMI.
    // So we check *after* each `session.next`: once `state.cmds >= 1`,
    // any non-SEMI token is the start of trailing content (a bare `;`
    // is a no-op `ecmd ::= SEMI` and stays allowed).  The check covers
    // both "garbage past first stmt" (engine errors on the token) and
    // "second valid stmt past first" (engine would keep running) — in
    // both cases the token's offset is the start of the trailing range.
    let lastMajor: TokenId | undefined
    let tail = sql.length
    const sourceTokens = tk.tokenize(sql, tokenizeOptions)
    for (const tok of sourceTokens) {
      if (tok.type === SPACE || tok.type === COMMENT) continue

      if (tok.type === ILLEGAL) {
        // sqlite's tokenize.c:707 formats it as: unrecognized token.
        // We record it and bail — attempting to recover typically
        // cascades into noise.
        tokens?.push(tok)
        diagnostics.push(buildIllegalTokenDiagnostic(tok))
        diagnostics.push(...state.errors)
        return {
          ok: false,
          errors: createParseDiagnosticArray(errorContext, diagnostics),
          tokens,
        }
      }

      tokens?.push(tok)
      session.next(tok.type, tok)

      // `state.cmds` only bumps past 0 once the `ecmd ::= cmdx SEMI`
      // reduction actually fires — which LALR defers until it sees the
      // lookahead *after* the SEMI.  That reduction runs during the
      // `session.next` above (before any shift-error), so by this
      // point `state.cmds.length >= 1` on the first non-SEMI token of
      // stmt 2 whether or not that token would have been a valid
      // continuation.  Check this before `session.phase === "errored"`
      // so trailing-garbage produces the targeted "expected end of
      // input" diagnostic instead of a raw shift-error at the token.
      const isTrailing = state.cmds.length >= 1 && tok.type !== SEMI
      if (isTrailing && mode.rejectTrailing) {
        diagnostics.push({
          message: "expected end of input after single statement",
          token: tok,
          span: {
            offset: tok.span.offset,
            length: sql.length - tok.span.offset,
            line: tok.span.line,
            col: tok.span.col,
          },
        })
        diagnostics.push(...state.errors)
        return {
          ok: false,
          errors: createParseDiagnosticArray(errorContext, diagnostics),
          tokens,
        }
      }
      if (isTrailing && mode.firstStatement) {
        // First statement is committed; the current token is the start
        // of trailing content we're not going to consume.  Report its
        // offset as `tail` and hand back the populated state.
        tail = tok.span.offset
        return { ok: true, state, tail, tokens }
      }

      if (session.phase === "errored") return syntaxErrorResult(tok)

      noteSuccessfulToken(tok)
      if (session.phase !== "running") break
    } // end parse loop

    // EOF tail — mirrors tokenize.c:674 sqlite3RunParser.  If the last
    // real token wasn't a SEMI, feed a virtual one to close the
    // current statement.  Then feed 0 (end-of-input marker) to trigger
    // the final reduce/accept.  Both are synthetic tokens with
    // zero-length spans at the tokenizer's final cursor. Skip both if
    // the session already terminated during the token loop.
    if (session.phase === "running") {
      const endSpan = {
        offset: sourceTokens.offset,
        length: 0,
        line: sourceTokens.line,
        col: sourceTokens.col,
      }

      if (lastMajor !== SEMI) {
        const semiToken: Token = {
          type: SEMI,
          text: "",
          span: endSpan,
          synthetic: true,
        }
        tokens?.push(semiToken)
        session.next(SEMI, semiToken)
        if (session.errors.length > 0) return syntaxErrorResult(semiToken)
      }

      if (session.phase === "running") {
        const eofToken: Token = {
          type: EOF,
          text: "",
          span: endSpan,
          synthetic: true,
        }
        tokens?.push(eofToken)
        session.next(EOF, eofToken)
        if (session.errors.length > 0) return syntaxErrorResult(eofToken)
      }
    }

    diagnostics.push(...state.errors)

    if (diagnostics.length > 0) {
      return {
        ok: false,
        errors: createParseDiagnosticArray(errorContext, diagnostics),
        tokens,
      }
    }
    if (session.phase === "accepted") {
      return { ok: true, state, tail, tokens }
    }
    return {
      ok: false,
      errors: createParseDiagnosticArray(errorContext, [
        {
          message: "parse did not accept input",
          span: { offset: 0, length: 0, line: 1, col: 0 },
        },
      ]),
      tokens,
    }
  }

  function parse(sql: string, opts: ParseOptions = {}): ParseResult {
    const outcome = runCore(sql, opts, {
      firstStatement: false,
      rejectTrailing: Boolean(options.singleStatement),
    })
    if (!outcome.ok) {
      return {
        status: "error",
        errors: outcome.errors,
        tokens: outcome.tokens,
      }
    }
    return {
      status: "ok",
      root: finalizeCmdList(outcome.state),
      tokens: outcome.tokens,
    }
  }

  function parseOrThrow(sql: string, opts?: ParseOptions): ParseOk {
    const result = parse(sql, opts)
    if (result.status === "error") {
      throw new Sqlite3ParserDiagnosticError(result.errors)
    }
    return result
  }

  function parseStmt(sql: string, opts: ParseStmtOptions = {}): ParseStmtResult {
    const { allowTrailing = false, ...rest } = opts
    const outcome = runCore(sql, rest, {
      firstStatement: true,
      rejectTrailing: !allowTrailing,
    })
    if (!outcome.ok) {
      return {
        status: "error",
        errors: outcome.errors,
        tokens: outcome.tokens,
      }
    }
    const root = outcome.state.cmds[0]
    if (!root) {
      // Grammar accepts a program consisting only of bare `;`
      // separators (or nothing at all).  `parseStmt`'s contract is
      // "give me one statement", so treat that as a parse error rather
      // than an awkward optional root.
      return {
        status: "error",
        errors: createParseDiagnosticArray({ source: sql, filename: opts.filename }, [
          {
            message: "no SQL statement in input",
            span: { offset: 0, length: 0, line: 1, col: 0 },
          },
        ]),
        tokens: outcome.tokens,
      }
    }
    return { status: "ok", root, tail: outcome.tail, tokens: outcome.tokens }
  }

  function parseStmtOrThrow(sql: string, opts: ParseStmtOptions = {}): ParseStmtOk {
    const result = parseStmt(sql, opts)
    if (result.status === "error") {
      throw new Sqlite3ParserDiagnosticError(result.errors)
    }
    return result
  }

  // Expose the tokenizer too so callers can inspect raw tokens for
  // syntax highlighting / diagnostics without running a full parse.
  return {
    parse,
    parseOrThrow,
    parseStmt,
    parseStmtOrThrow,
    tokenize: tk.tokenize,
    tokenName: tk.tokenName,
    createEngine,
    reduce,
    createState,
    withOptions: (newOptions: CreateParserOptions) =>
      parserModuleForGrammar(parserDefs, keywordDefs, {
        ...options,
        ...newOptions,
      }),
    parserDefs,
    keywordDefs,
  }
}

function requireTokenId(
  parserDefs: Pick<ParserDefs<unknown, unknown>, "symbols">,
  name: string,
): TokenId {
  const id = parserDefs.symbols.indexOf(name)
  if (id < 0) throw new Error(`parser.ts: missing terminal token "${name}"`)
  return id as TokenId
}
