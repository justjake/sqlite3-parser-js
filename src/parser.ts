// AST-building SQL parser.
//
// This module is the orchestration layer above src/lempar.ts (the pure
// LALR driver). It tokenizes source text, feeds terminals into the
// engine, lets the generated reducer build AST state, and merges
// low-level diagnostics into the public ParseError API.

import {
  TokenizeOpts,
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
  LalrReduce,
  CreateLalrEngine,
} from "./lempar.ts"
import {
  bindSyntaxDiagnostics,
  buildIllegalTokenDiagnostic,
  createParseErrorArray,
  type Diagnostic,
  type ParseError,
} from "./errors.ts"
import type { CmdList } from "./ast/nodes.ts"
import { finalizeCmdList } from "./ast/parseActions.ts"
import type { ParseState } from "./ast/parseState.ts"

/** Options for a parser module.  Tokenizer-level options are forwarded verbatim. */
export interface CreateParserOptions extends CreateTokenizerOptions {
  /**
   * Reject input containing more than one top-level SQL statement.  When
   * set, the parser stops at the first statement's terminating `SEMI`
   * and, if any further tokens (other than additional bare `;`
   * separators) remain, returns `{status: "errored"}` with a single
   * `ParseError` whose span covers from the first trailing token to
   * end-of-input.  Useful for contexts like `prepare_v2`-style call sites
   * where only one statement is meaningful.  Defaults to `false`.
   */
  readonly singleStatement?: boolean
}

export type ParseResult =
  | { status: "accepted"; ast: CmdList }
  | { status: "errored"; errors: readonly ParseError[] }

// ---------------------------------------------------------------------------
// parserModuleForGrammar — bind the driver to a specific
// parser.json + keywords.json.
// ---------------------------------------------------------------------------

export type ParseOpts = TokenizeOpts & {
  /** Annotate any returned errors with this filename. */
  filename?: string
}

/**
 * SQlite3 Parser library.
 */
export interface ParserModule {
  /** Parse a SQL string into an AST. */
  parse(source: string, opts?: ParseOpts): ParseResult
  /** Tokenize a SQL string into a stream of tokens. */
  tokenize(source: string, opts?: TokenizeOpts): TokenIterator
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
  const EOF = 0 as TokenId

  // -------------------------------------------------------------------------
  // parse — public entry point.
  //
  // Tokenises the input, feeds it to the engine as a lazy iterable of
  // `{major, value}` pairs, and translates the engine's result into a
  // ParseResult with AST and user-facing error messages.
  // -------------------------------------------------------------------------
  function parse(sql: string, opts: ParseOpts = {}): ParseResult {
    const { filename, ...tokenizeOpts } = opts
    const errorContext = { source: sql, filename }
    const diagnostics: Diagnostic[] = []

    // Structurally the same shape as sqlite's tokenize.c:674
    // sqlite3RunParser: get a token, feed it to the parser, repeat
    // until end-of-input or error; then inject a virtual SEMI (if the
    // last real token wasn't one) and the `$` end marker.
    const state = createState()
    const session = createEngine(reduce, state)

    // Chronological token stream we actually fed the session.
    // If `emitTrivia` is enabled on the tokenizer we still screen out
    // SPACE/COMMENT before parser dispatch, so this remains aligned with
    // the engine's tokenIndex values. Synthetic SEMI/EOF are appended.
    const tokenStream: Token[] = []

    // Open-delimiter stack, maintained in lockstep with the dispatch
    // loop.  Lets `buildSyntaxError` point at the unmatched opener
    // without rescanning the token stream.  END is shared between
    // CASE/END and (future) BEGIN/END blocks, so we peek the top to
    // decide whether a close matches — a pure close-token lookup would
    // misbehave.  Only the opener Token is retained; the pair is
    // implicit in its type.
    const openers: Token[] = []

    // `singleStatement` tripwire: the `ecmd ::= cmdx SEMI` reduction
    // that bumps `state.cmds` from 0 to 1 is deferred by LALR lookahead
    // — it fires when we feed the token *after* the terminating SEMI.
    // So we check *after* each `session.next`: once `state.cmds >= 1`,
    // any non-SEMI token is the start of trailing content (a bare `;`
    // is a no-op `ecmd ::= SEMI` and stays allowed).  The check covers
    // both "garbage past first stmt" (engine errors on the token) and
    // "second valid stmt past first" (engine would keep running) — in
    // both cases the token's offset is the start of the trailing range.
    let lastMajor: TokenId | undefined
    const sourceTokens = tk.tokenize(sql, tokenizeOpts)
    for (const tok of sourceTokens) {
      if (tok.type === SPACE || tok.type === COMMENT) continue

      if (tok.type === ILLEGAL) {
        // sqlite's tokenize.c:707 formats it as: unrecognized token.
        // We record it and bail — attempting to recover typically
        // cascades into noise.
        diagnostics.push(buildIllegalTokenDiagnostic(tok))
        diagnostics.push(...state.errors)
        return { status: "errored", errors: createParseErrorArray(errorContext, diagnostics) }
      }

      tokenStream.push(tok)
      const t = tok.type
      if (t === LP || t === CASE) {
        openers.push(tok)
      } else if (t === RP || t === END) {
        const top = openers[openers.length - 1]
        if (top && ((top.type === LP && t === RP) || (top.type === CASE && t === END))) {
          openers.pop()
        }
      }
      session.next(t, tok)

      if (options.singleStatement && state.cmds.length >= 1 && tok.type !== SEMI) {
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
        return { status: "errored", errors: createParseErrorArray(errorContext, diagnostics) }
      }

      if (session.phase !== "running") break
      lastMajor = tok.type
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
        tokenStream.push(semiToken)
        session.next(SEMI, semiToken)
      }

      if (session.phase === "running") {
        const eofToken: Token = {
          type: EOF,
          text: "",
          span: endSpan,
          synthetic: true,
        }
        tokenStream.push(eofToken)
        session.next(EOF, eofToken)
      }
    }

    // Translate each engine error into a grammar-aware diagnostic.
    // YYNOERRORRECOVERY means the engine records at most one, but loop
    // in case that ever changes. Engine input values are always Tokens.
    for (const e of session.errors) {
      diagnostics.push(
        buildSyntaxError({
          token: e.minor as Token,
          state: e.stateno,
          tokens: tokenStream,
          tokenIndex: e.tokenIndex,
          openers,
        }),
      )
    }

    diagnostics.push(...state.errors)

    if (diagnostics.length > 0) {
      return { status: "errored", errors: createParseErrorArray(errorContext, diagnostics) }
    }
    if (session.phase === "accepted") {
      return { status: "accepted", ast: finalizeCmdList(state) }
    } else {
      return {
        status: "errored",
        errors: createParseErrorArray(errorContext, [
          {
            message: "parse did not accept input",
            span: { offset: 0, length: 0, line: 1, col: 0 },
          },
        ]),
      }
    }
  }

  // Expose the tokenizer too so callers can inspect raw tokens for
  // syntax highlighting / diagnostics without running a full parse.
  return {
    parse,
    tokenize: tk.tokenize,
    tokenName: tk.tokenName,
    createEngine,
    reduce,
    createState,
    withOptions: (newOpts: CreateParserOptions) =>
      parserModuleForGrammar(parserDefs, keywordDefs, { ...options, ...newOpts }),
    parserDefs,
    keywordDefs,
  }
}
