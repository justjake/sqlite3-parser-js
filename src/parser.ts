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
} from "./lempar.ts"
import {
  buildIllegalTokenError,
  enhanceParseError,
  lineColAt,
  type ParseError,
} from "./enhanceError.ts"
import { validate } from "./semantic.ts"

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

export interface ParseResult {
  /** The CST root, present iff the parser reached YY_ACCEPT_ACTION. */
  readonly cst?: CstNode
  /** Any errors encountered.  Non-empty implies either a partial or no CST. */
  readonly errors: readonly ParseError[]
}

// ---------------------------------------------------------------------------
// parserModuleForGrammar — bind the driver to a specific
// parser.json + keywords.json.
// ---------------------------------------------------------------------------

/**
 * SQlite3 Parser library.
 */
export interface ParserModule {
  /** The specific SQLite version this bundle was generated from. */
  readonly SQLITE_VERSION: string
  /** Parse a SQL string into a CST. */
  parse(source: string): ParseResult
  /** Tokenize a SQL string into a stream of tokens. */
  tokenize(source: string, opts?: TokenizeOpts): IterableIterator<LexerToken>
  /** Look up the display name of a token-id, e.g. `TokenId(1) → "SEMI"`. */
  tokenName(code: TokenId): string | undefined
  /** Create the underlying LALR state machine engine, used by {@link parse}. */
  createEngine<T>(reducer: LalrReduce<T>): LalrEngine<T>
  /**
   * Create a new parser module with the given options.
   * Parser modules are stateless, you should create one at module scope and reuse it.
   */
  withOptions(opts: CreateParserOptions): ParserModule
  /** LALR parser definition. */
  readonly PARSER_DEFS: ParserDefs
  /** SQLite keywords recognized by the tokenizer. */
  readonly KEYWORD_DEFS: KeywordDefs
}

/**
 * Create a Parser for the grammar specified by `parserDefs` and `keywordDefs`.
 */
export function parserModuleForGrammar(args: {
  SQLITE_VERSION: string
  PARSER_DEFS: ParserDefs
  KEYWORD_DEFS: KeywordDefs
  options: CreateParserOptions
}): ParserModule {
  const { SQLITE_VERSION, PARSER_DEFS, KEYWORD_DEFS, options } = args
  const createEngine = engineModuleForGrammar(PARSER_DEFS)
  const rules = PARSER_DEFS.rules

  const symbols = PARSER_DEFS.symbols

  // -------------------------------------------------------------------------
  // CST DIVERGENCE #1 — Unit-rule-elimination recovery.
  //
  // Lemon's table generator marks unit rules like `cmdlist ::= ecmd` as
  // `doesReduce=false` and folds them into surrounding reductions (e.g.
  // `input ::= cmdlist` pops what LOOKS like an ecmd off the stack and
  // treats it as a cmdlist).  The LALR *engine* happily follows those
  // tables — nothing in the C code needs to know those rules were
  // elided, because the rule's C action was empty to begin with.
  //
  // For a CST that reflects the authored grammar, we need to put the
  // invisible wrapper nodes back.  `unitWrapper[target][source]` is
  // the id of the rule to apply when we pop a symbol of type `source`
  // where a symbol of type `target` was expected.  In SQLite's current
  // grammar all 14 collapsed rules are 1:1 unit rules; a single lookup
  // suffices.
  // -------------------------------------------------------------------------
  const unitWrapper = new Map<SymbolId, Map<SymbolId, RuleId>>()
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!
    if (r.doesReduce) continue
    if (r.rhs.length !== 1) continue
    const src = r.rhs[0]?.symbol
    if (src === undefined) continue
    let inner = unitWrapper.get(r.lhs)
    if (!inner) unitWrapper.set(r.lhs, (inner = new Map()))
    inner.set(src, i as RuleId)
  }

  // -------------------------------------------------------------------------
  // CST DIVERGENCE #2 — Multi-terminal RHS matching.
  //
  // Positions declared with `%token_class foo A|B|C` accept any of
  // {A,B,C}.  Lemon handles this transparently at table-generation
  // time, so the engine never needs to consult the multi set at
  // runtime.  *We* do, but only as a pre-check: "was the popped entry
  // one of the allowed terminals? if so, don't fire unit-rule
  // synthesis."  If we skipped this check we'd spuriously wrap e.g. an
  // INDEXED token when the rule's RHS is `id = ID|INDEXED|JOIN_KW`.
  // -------------------------------------------------------------------------

  /** Does `actualMajor` satisfy the RHS-position `expected` constraint? */
  function rhsMatches(expected: ParserRhsPos, actualMajor: SymbolId): boolean {
    if (expected.symbol !== undefined) return expected.symbol === actualMajor
    if (expected.multi !== undefined) {
      for (const s of expected.multi) if (s.symbol === actualMajor) return true
    }
    return false
  }

  /**
   * If the node's symbol type is `actualMajor` but position `expected`
   * wants something else, wrap it in the invisible unit-rule node(s)
   * that Lemon elided.  Iterates in case a future version introduces
   * multi-step unit chains.
   */
  function synthesizeWrappers(
    expected: ParserRhsPos,
    actualMajor: SymbolId,
    node: CstNode,
  ): CstNode {
    let cur = node
    let curMajor = actualMajor
    for (let safety = 0; safety < 4; safety++) {
      if (rhsMatches(expected, curMajor)) break
      // `expected.symbol` is the only target we know how to reach via
      // unit rules — if the expected position is a MULTITERMINAL set
      // and nothing matched, we've found a grammar invariant violation
      // rather than an elision.
      const target = expected.symbol
      if (target === undefined) break
      const wrapperId = unitWrapper.get(target)?.get(curMajor)
      if (wrapperId === undefined) break
      const wrapperRule = rules[wrapperId]!
      cur = {
        kind: "rule",
        rule: wrapperId,
        name: wrapperRule.lhsName,
        lhs: wrapperRule.lhs,
        children: [cur],
        start: cur.start,
        length: cur.length,
      }
      curMajor = wrapperRule.lhs
    }
    return cur
  }

  // Bind a tokenizer.  The parser uses the same TK_* ids the defs'
  // symbol table assigns, so everything stays in sync.
  const tk = tokenizerModuleForGrammar(PARSER_DEFS, KEYWORD_DEFS, options)

  /** Token id 0 is Lemon's end-of-input marker (`$`). */
  const TK_EOF: TokenId = 0 as TokenId
  const TK_SEMI = tk.tokens.SEMI
  const TK_ILLEGAL = tk.tokens.ILLEGAL

  // -------------------------------------------------------------------------
  // Build the RuleNode for a given reduction.  This is the engine's
  // `onReduce` callback — it runs once per reduction and returns the
  // new stack value.
  //
  // The work here is all CST-emitter: figuring out which popped entries
  // should become children (virtual tokens drop out), running unit-rule
  // synthesis, and tightening the span around non-empty children.
  // -------------------------------------------------------------------------
  function buildRuleNode(ruleId: RuleId, popped: LalrPopped<CstNode>[]): CstNode {
    const rule = rules[ruleId]

    // Walk popped entries alongside the rule's declared RHS.  Each
    // entry becomes a child, possibly wrapped in synthetic unit-rule
    // nodes that Lemon elided.  Synthetic tokens (injected SEMI/EOF)
    // ride along with `synthetic: true` and zero-length spans.
    const children: CstNode[] = []
    for (let i = 0; i < popped.length; i++) {
      const entry = popped[i]
      const rhsPos = rule.rhs[i]
      children.push(rhsPos ? synthesizeWrappers(rhsPos, entry.major, entry.minor) : entry.minor)
    }

    // Compute the rule's span from its children.  Children with
    // length=0 don't contribute — they're either empty-RHS rules (no
    // source text to anchor to) or synthetic siblings.  Skipping them
    // keeps the span tight and prevents negative lengths when a
    // zero-length child appears at the end of the sequence.
    let start = 0
    let length = 0
    let sawSpan = false
    for (const c of children) {
      if (c.length === 0) continue
      if (!sawSpan) {
        start = c.start
        sawSpan = true
      }
      length = c.start + c.length - start
    }

    const ruleNode: RuleNode = {
      kind: "rule",
      rule: ruleId,
      name: rule.lhsName,
      lhs: rule.lhs,
      children,
      start,
      length,
    }
    return ruleNode
  }

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
    const session = createEngine(buildRuleNode)

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
        name: symbols[tok.type]?.name ?? String(tok.type),
        text: tok.text,
        start: tok.span.offset,
        length: tok.span.length,
        line: tok.span.line,
        col: tok.span.col,
        synthetic: false,
      }

      if (tok.type === TK_ILLEGAL) {
        // sqlite's tokenize.c:707 formats it as: unrecognized token.
        // We record it and bail — attempting to recover typically
        // cascades into noise.
        errors.push(buildIllegalTokenError(sql, node))
        return { errors }
      }

      tokenStream.push(node)
      session.next(tok.type, node)
      if (session.state !== "running") break
      lastMajor = tok.type
    }

    // EOF tail — mirrors tokenize.c:674 sqlite3RunParser.  If the last
    // real token wasn't a SEMI, feed a virtual one to close the
    // current statement.  Then feed 0 (end-of-input marker) to trigger
    // the final reduce/accept.  Both are real TokenNodes with
    // `synthetic: true` and zero-length span at `sql.length`.  Skip
    // both if the session already terminated during the token loop.
    if (session.state === "running") {
      const endPos = sql.length
      const { line: endLine, col: endCol } = lineColAt(sql, endPos)
      if (lastMajor !== TK_SEMI) {
        const semiNode: TokenNode = {
          kind: "token",
          type: TK_SEMI,
          name: symbols[TK_SEMI]?.name ?? "SEMI",
          text: "",
          start: endPos,
          length: 0,
          line: endLine,
          col: endCol,
          synthetic: true,
        }
        tokenStream.push(semiNode)
        session.next(TK_SEMI, semiNode)
      }
      if (session.state === "running") {
        const eofNode: TokenNode = {
          kind: "token",
          type: TK_EOF,
          name: symbols[TK_EOF]?.name ?? "$",
          text: "",
          start: endPos,
          length: 0,
          line: endLine,
          col: endCol,
          synthetic: true,
        }
        tokenStream.push(eofNode)
        session.next(TK_EOF, eofNode)
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
          defs: PARSER_DEFS,
          tokens: tokenStream,
          tokenIndex: e.inputIndex,
        }),
      )
    }

    if (session.state === "accepted" && session.root) {
      // Run the parse.y semantic-action port against the CST.  See
      // src/semantic.ts and generated/<ver>/semantic-actions.snapshot.json.
      for (const e of validate(session.root, PARSER_DEFS, sql, {
        digitSeparator: options.digitSeparator,
      })) {
        errors.push(e)
      }
      return { cst: session.root, errors }
    }
    return { errors }
  }

  // Expose the tokenizer too so callers can inspect raw tokens for
  // syntax highlighting / diagnostics without running a full parse.
  return {
    SQLITE_VERSION,
    parse,
    tokenize: tk.tokenize,
    tokenName: tk.tokenName,
    createEngine,
    withOptions: (newOpts: CreateParserOptions) =>
      parserModuleForGrammar({ ...args, options: { ...options, ...newOpts } }),
    PARSER_DEFS: PARSER_DEFS,
    KEYWORD_DEFS: KEYWORD_DEFS,
  }
}

// ---------------------------------------------------------------------------
// Helpers — tree walking and pretty-printing.
// ---------------------------------------------------------------------------

// Re-export the defs type so callers can import it without reaching
// into the engine module.
export type { ParserDefs } from "./lempar.ts"
export type { ParseError } from "./enhanceError.ts"
