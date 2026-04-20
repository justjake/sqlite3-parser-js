// CST-building SQL parser.
//
// This module is a thin layer on top of src/lempar.ts (the pure LALR
// driver, itself a 1:1 port of tool/lempar.c).  The engine handles all
// of the faithful-to-lempar.c work — shift/reduce dispatch, fallback
// lookup, wildcard, etc.  Everything in *this* file is CST-emitter
// divergence from the C codebase: we translate raw tokens into CST
// {@link TokenNode}s, reduce callbacks into CST {@link RuleNode}s, and reconstruct
// the grammar structure that Lemon's table generator elided via
// unit-rule elimination.
//
// If you're porting a change from sqlite/tool/lempar.c, you're
// probably looking at src/lempar.ts — not this file.  Reach for
// parser.ts when the CST shape changes, or when you want to alter how
// virtual tokens / error messages / trivia are represented.

import {
  TokenizeOpts,
  tokenizerModuleForGrammar,
  Token as LexerToken,
  type CreateTokenizerOptions,
  type KeywordDefs,
} from "./tokenize.ts"
import {
  engineModuleForGrammar,
  type ParserRhsPos,
  type LalrPopped,
  type ParserDefs,
  type RuleId,
  type SymbolId,
  type TokenId,
  LalrReduce,
  LalrEngine,
  CreateLalrEngine,
} from "./lempar.ts"
import {
  buildIllegalTokenError,
  enhanceParseError,
  lineColAt,
  type ParseError,
} from "./enhanceError.ts"
import { Cmd } from "./ast/nodes.ts"
import { AstNode } from "../vendor/liteparser/wasm/src/index.ts"
import { ParseState } from "./ast/parseState.ts"

// ---------------------------------------------------------------------------
// CST node shapes.  These are emitter-defined — the engine knows
// nothing about them.
// ---------------------------------------------------------------------------

/** A leaf node — one token from the tokenizer. */
export interface TokenNode {
  readonly kind: "token"
  /** Numeric TK_* code (matches lemon's terminal symbol id). */
  readonly type: TokenId
  /** Stringified TK_* name, e.g. `"SELECT"`, `"ID"`, `"INTEGER"`. */
  readonly name: string
  /** Source text covered by the token.  Empty string for synthetic tokens. */
  readonly text: string
  /** Byte offset of the token in the original source string. */
  readonly start: number
  /** Length of the token in source characters.  Zero for synthetic tokens. */
  readonly length: number
  /** 1-based line number of the token's first character (LF breaks lines). */
  readonly line: number
  /** 1-based column of the token's first character, in UTF-16 code units. */
  readonly col: number
  /**
   * True iff this token was injected by the parser rather than read from
   * the source.  At end-of-input we inject a virtual SEMI (to close the
   * current statement) and a virtual `$` (to trigger YY_ACCEPT_ACTION);
   * both carry `synthetic: true`, `text: ""`, `length: 0`, `start:
   * sql.length`, and `line`/`col` pointing past the last source char.
   * `tokenLeaves()` filters these out by default so existing callers see
   * only source tokens.
   */
  readonly synthetic: boolean
}

/** An internal node — the result of a grammar reduction. */
export interface RuleNode {
  readonly kind: "rule"
  /** Lemon rule id (matches `rules[ruleId]` in the defs). */
  readonly rule: RuleId
  /**
   * The nonterminal name on the left-hand side, e.g. `"select"`,
   * `"expr"`, `"cmdlist"`.  This is the natural CST label.
   */
  readonly name: string
  /** Nonterminal symbol id (always a nonterminal, despite the union type). */
  readonly lhs: SymbolId
  /** Direct children, in source order. */
  readonly children: readonly CstNode[]
  /** Source offset of the first child (or 0 for an empty reduction). */
  readonly start: number
  /** Source length, from the first child's start to the last child's end. */
  readonly length: number
}

export type CstNode = TokenNode | RuleNode

/** Parser options are forwarded to the tokenizer bound inside the parser. */
export type CreateParserOptions = CreateTokenizerOptions

export type ParseResult =
  | { status: "accepted"; ast: Cmd }
  | { status: "errored"; errors: readonly ParseError[] }

// ---------------------------------------------------------------------------
// parserModuleForGrammar — bind the driver to a specific
// parser.json + keywords.json.
// ---------------------------------------------------------------------------

/**
 * SQlite3 Parser library.
 */
export interface ParserModule {
  /** Parse a SQL string into a CST. */
  parse(source: string): ParseResult
  /** Tokenize a SQL string into a stream of tokens. */
  tokenize(source: string, opts?: TokenizeOpts): IterableIterator<LexerToken>
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
  parserDefs: ParserDefs
  /** SQLite keywords recognized by the tokenizer. */
  keywordDefs: KeywordDefs
}

/**
 * Create a Parser for the grammar specified by `parserDefs` and `keywordDefs`.
 */
export function parserModuleForGrammar(
  parserDefs: ParserDefs,
  keywordDefs: KeywordDefs,
  options: CreateParserOptions,
): ParserModule {
  const { symbols, reduce, createState } = parserDefs
  const tk = tokenizerModuleForGrammar(parserDefs, keywordDefs, options)
  const createEngine = engineModuleForGrammar(parserDefs)

  const { ILLEGAL, SEMI } = tk.tokens
  const EOF = 0 as TokenId

  // -------------------------------------------------------------------------
  // parse — public entry point.
  //
  // Tokenises the input, feeds it to the engine as a lazy iterable of
  // `{major, value}` pairs, and translates the engine's result into a
  // ParseResult with CST and user-facing error messages.
  // -------------------------------------------------------------------------
  function parse(sql: string): ParseResult {
    const errors: ParseError[] = []

    // Structurally the same shape as sqlite's tokenize.c:674
    // sqlite3RunParser: get a token, feed it to the parser, repeat
    // until end-of-input or error; then inject a virtual SEMI (if the
    // last real token wasn't one) and the `$` end marker.
    const session = createEngine(reduce, createState())

    // Chronological token stream we actually fed the session.
    // enhanceParseError scans this backward from the failing token to
    // find unclosed groups, trailing commas, FILTER-before-OVER, etc.,
    // so it needs to include synthetic SEMI/EOF markers too.
    const tokenStream: TokenNode[] = []

    let lastMajor: TokenId | undefined
    for (const tok of tk.tokenize(sql)) {
      const node: TokenNode = {
        kind: "token",
        type: tok.type,
        name: symbols[tok.type] ?? String(tok.type),
        text: tok.text,
        start: tok.span.offset,
        length: tok.span.length,
        line: tok.span.line,
        col: tok.span.col,
        synthetic: false,
      }

      if (tok.type === ILLEGAL) {
        // sqlite's tokenize.c:707 formats it as: unrecognized token.
        // We record it and bail — attempting to recover typically
        // cascades into noise.
        errors.push(buildIllegalTokenError(sql, node))
        return { status: "errored", errors }
      }

      tokenStream.push(node)
      session.next(tok.type, node)
      if (session.phase !== "running") break
      lastMajor = tok.type
    } // end parse loop

    // EOF tail — mirrors tokenize.c:674 sqlite3RunParser.  If the last
    // real token wasn't a SEMI, feed a virtual one to close the
    // current statement.  Then feed 0 (end-of-input marker) to trigger
    // the final reduce/accept.  Both are real TokenNodes with
    // `synthetic: true` and zero-length span at `sql.length`.  Skip
    // both if the session already terminated during the token loop.
    if (session.phase === "running") {
      const endPos = sql.length
      const { line: endLine, col: endCol } = lineColAt(sql, endPos)

      if (lastMajor !== SEMI) {
        const semiNode: TokenNode = {
          kind: "token",
          type: SEMI,
          name: symbols[SEMI] ?? "SEMI",
          text: "",
          start: endPos,
          length: 0,
          line: endLine,
          col: endCol,
          synthetic: true,
        }
        tokenStream.push(semiNode)
        session.next(SEMI, semiNode)
      }

      if (session.phase === "running") {
        const eofNode: TokenNode = {
          kind: "token",
          type: EOF,
          name: symbols[EOF] ?? "$",
          text: "",
          start: endPos,
          length: 0,
          line: endLine,
          col: endCol,
          synthetic: true,
        }
        tokenStream.push(eofNode)
        session.next(EOF, eofNode)
      }
    }

    // Translate each engine error into a grammar-aware ParseError.
    // YYNOERRORRECOVERY means the engine records at most one, but loop
    // in case that ever changes.  Engine input values are always
    // TokenNodes (we only feed terminals), so the cast is safe.
    for (const e of session.errors) {
      errors.push(
        enhanceParseError({
          sql,
          token: e.minor as TokenNode,
          state: e.stateno,
          defs: parserDefs,
          tokens: tokenStream,
          tokenIndex: e.tokenIndex,
        }),
      )
    }

    if (session.phase === "accepted") {
      return { status: "accepted", ast: session.root as Cmd }
    } else {
      return { status: "errored", errors }
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
