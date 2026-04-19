// CST-building SQL parser.
//
// This module is a thin layer on top of src/lempar.ts (the pure LALR
// driver, itself a 1:1 port of tool/lempar.c).  The engine handles all
// of the faithful-to-lempar.c work — shift/reduce dispatch, fallback
// lookup, wildcard, etc.  Everything in *this* file is CST-emitter
// divergence from the C codebase: we translate raw tokens into CST
// `TokenNode`s, reduce callbacks into CST `RuleNode`s, and reconstruct
// the grammar structure that Lemon's table generator elided via
// unit-rule elimination.
//
// If you're porting a change from sqlite/tool/lempar.c, you're
// probably looking at src/lempar.ts — not this file.  Reach for
// parser.ts when the CST shape changes, or when you want to alter how
// virtual tokens / error messages / trivia are represented.

import { createTokenizer, type KeywordDefs } from "./tokenize.ts"
import {
  createEngine,
  type ParserRhsPos,
  type ParserRule,
  type LalrPopped,
  type ParserDefs,
  type RuleId,
  type SymbolId,
  type TokenId,
} from "./lempar.ts"
import { enhanceParseError } from "./enhanceError.ts"

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
  /**
   * True iff this token was injected by the parser rather than read from
   * the source.  At end-of-input we inject a virtual SEMI (to close the
   * current statement) and a virtual `$` (to trigger YY_ACCEPT_ACTION);
   * both carry `synthetic: true`, `text: ""`, `length: 0`, `start:
   * sql.length`.  `tokenLeaves()` filters these out by default so existing
   * callers see only source tokens.
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

export interface ParseError {
  /**
   * Short human-readable summary (`message` is used for back-compat;
   * prefer `canonical` + `hint` for new code).  Kept in sync with
   * `canonical` for engine-level errors.
   */
  readonly message: string
  /** The offending token, if we had one when the error was raised. */
  readonly token?: TokenNode
  /**
   * SQLite-style canonical summary, e.g. `near "FROM": syntax error`
   * or `incomplete input`.  Only set for errors that came from the
   * LALR engine; tokenizer errors (e.g. unrecognised token) only set
   * `message`.
   */
  readonly canonical?: string
  /** Grammar-aware hint.  See enhanceError.ts for the heuristics. */
  readonly hint?: string
  /** 1-based line of the failing token, or end of input. */
  readonly line?: number
  /** 1-based column. */
  readonly col?: number
  /** Half-open source range `[start, end)`. */
  readonly range?: readonly [number, number]
  /** Display names of terminals that would have been accepted here. */
  readonly expected?: readonly string[]
}

export interface ParseResult {
  /** The CST root, present iff the parser reached YY_ACCEPT_ACTION. */
  readonly cst?: CstNode
  /** Any errors encountered.  Non-empty implies either a partial or no CST. */
  readonly errors: readonly ParseError[]
}

// Internal — the stack-value type we hand to the engine.  Virtual
// SEMI/EOF markers ride the stack as real TokenNodes with
// `synthetic: true`; they appear as CST children like any other token
// (filtered by `tokenLeaves` by default), and survive into the parse
// result so diagnostics can see them.
type EngineValue = CstNode

// ---------------------------------------------------------------------------
// createParser — bind the driver to a specific parser.json + keywords.json.
// ---------------------------------------------------------------------------

export function createParser(parserDefs: ParserDefs, keywordDefs: KeywordDefs) {
  const engine = createEngine(parserDefs)
  const rules = parserDefs.rules

  // Symbol-id → display name (used to build the CST token names).
  // Mirrors yyTokenName[] in the generated parse.c.  Symbols are
  // keyed on array index — the prod defs has no explicit `id` field.
  const symbolName: string[] = []
  for (let i = 0; i < parserDefs.symbols.length; i++) {
    symbolName[i] = parserDefs.symbols[i]!.name
  }

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
  // the rule to apply when we pop a symbol of type `source` where a
  // symbol of type `target` was expected.  In SQLite's current grammar
  // all 14 collapsed rules are 1:1 unit rules; a single lookup
  // suffices.
  // -------------------------------------------------------------------------
  // Each entry carries the rule plus the rule id (its index in `rules`),
  // since we drop `rule.id` from the prod defs and still need to stamp
  // the wrapper's `RuleNode.rule` at synthesis time.
  const unitWrapper = new Map<SymbolId, Map<SymbolId, { rule: ParserRule; ruleId: RuleId }>>()
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!
    if (r.doesReduce) continue
    if (r.rhs.length !== 1) continue
    const src = r.rhs[0]?.symbol
    if (src === undefined) continue
    let inner = unitWrapper.get(r.lhs)
    if (!inner) unitWrapper.set(r.lhs, (inner = new Map()))
    inner.set(src, { rule: r, ruleId: i as RuleId })
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
      const wrapperEntry = unitWrapper.get(target)?.get(curMajor)
      if (!wrapperEntry) break
      const { rule: wrapperRule, ruleId: wrapperId } = wrapperEntry
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
  const tk = createTokenizer(parserDefs, keywordDefs)

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
  function buildRuleNode(ruleId: RuleId, popped: LalrPopped<EngineValue>[]): EngineValue {
    const rule = rules[ruleId]

    // Walk popped entries alongside the rule's declared RHS.  Each
    // entry becomes a child, possibly wrapped in synthetic unit-rule
    // nodes that Lemon elided.  Synthetic tokens (injected SEMI/EOF)
    // ride along with `synthetic: true` and zero-length spans.
    const children: CstNode[] = []
    for (let i = 0; i < popped.length; i++) {
      const entry = popped[i]
      const rhsPos = rule.rhs[i]
      children.push(rhsPos ? synthesizeWrappers(rhsPos, entry.major, entry.value) : entry.value)
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

    // Collect inputs into an array so we can pre-check for ILLEGAL
    // tokens and inject virtual SEMI/EOF tails before driving the
    // engine.  SQL strings are small; streaming isn't worth it here.
    const inputs: Array<{ major: TokenId; value: EngineValue }> = []
    // Sentinel `undefined` means "no real token seen yet" — avoids
    // inventing a bogus -1 that would need a cast to TokenId.
    let lastMajor: TokenId | undefined
    for (const tok of tk.tokenize(sql)) {
      if (tok.type === TK_ILLEGAL) {
        // sqlite's tokenize.c:707 formats it as: unrecognized token.
        // We record it and bail — attempting to recover typically
        // cascades into noise.
        const text = sql.slice(tok.start, tok.start + tok.length)
        errors.push({
          message: `unrecognized token: ${JSON.stringify(text)}`,
        })
        return { errors }
      }

      const node: TokenNode = {
        kind: "token",
        type: tok.type,
        name: symbolName[tok.type] ?? String(tok.type),
        text: sql.slice(tok.start, tok.start + tok.length),
        start: tok.start,
        length: tok.length,
        synthetic: false,
      }
      inputs.push({ major: tok.type, value: node })
      lastMajor = tok.type
    }

    // EOF tail — mirrors tokenize.c:674 sqlite3RunParser.  If the last
    // real token wasn't a SEMI, feed a virtual one to close the
    // current statement.  Then feed 0 (end-of-input marker) to trigger
    // the final reduce/accept.  Both are real TokenNodes with
    // `synthetic: true` and zero-length span at `sql.length`.
    const endPos = sql.length
    if (lastMajor !== TK_SEMI) {
      const semiNode: TokenNode = {
        kind: "token",
        type: TK_SEMI,
        name: symbolName[TK_SEMI] ?? "SEMI",
        text: "",
        start: endPos,
        length: 0,
        synthetic: true,
      }
      inputs.push({ major: TK_SEMI, value: semiNode })
    }
    const eofNode: TokenNode = {
      kind: "token",
      type: TK_EOF,
      name: symbolName[TK_EOF] ?? "$",
      text: "",
      start: endPos,
      length: 0,
      synthetic: true,
    }
    inputs.push({ major: TK_EOF, value: eofNode })

    const result = engine.run<EngineValue>(inputs, buildRuleNode)

    // Translate engine errors into user-facing ParseErrors with
    // grammar-aware diagnostics.  The token list we feed enhanceError
    // is the same chronological stream we fed the engine, so it can
    // scan backward for open groups, trailing commas, FILTER-after-OVER,
    // etc.  `inputs[i].value` is always a TokenNode (real or synthetic).
    const tokenStream: TokenNode[] = inputs.map((input) => {
      const v = input.value
      // Engine inputs are always terminals, so value is always a
      // TokenNode; the cast is just to satisfy TypeScript.
      return v as TokenNode
    })
    for (const e of result.errors) {
      const v = e.value
      const tokForError = v.kind === "token" ? v : undefined
      if (tokForError) {
        const diag = enhanceParseError({
          sql,
          token: tokForError,
          state: e.stateno,
          defs: parserDefs,
          tokens: tokenStream,
          tokenIndex: e.inputIndex,
        })
        errors.push({
          message: diag.canonical,
          token: tokForError,
          canonical: diag.canonical,
          hint: diag.hint,
          line: diag.line,
          col: diag.col,
          range: diag.range,
          expected: diag.expected,
        })
      } else {
        // Shouldn't happen — engine input values are always TokenNodes —
        // but fall back to a plain message so we don't swallow the error.
        errors.push({
          message: `syntax error near ${v.name}`,
        })
      }
    }

    if (result.accepted && result.root) {
      return { cst: result.root, errors }
    }
    if (!result.accepted && errors.length === 0) {
      // Engine ran out of input without accepting — well-formed
      // grammars shouldn't allow this, but guard anyway.
      errors.push({ message: "parser did not accept at end of input" })
    }
    return { errors }
  }

  // Expose the tokenizer too so callers can inspect raw tokens for
  // syntax highlighting / diagnostics without running a full parse.
  return {
    parse,
    tokenize: tk.tokenize,
    tokenName: tk.tokenName,
  }
}

// ---------------------------------------------------------------------------
// Helpers — tree walking and pretty-printing.
// ---------------------------------------------------------------------------

/**
 * Pretty-print a CST as indented S-expression-ish text.  Useful for
 * snapshot-style tests and quick inspection in a REPL.  Synthetic tokens
 * (injected SEMI/EOF) are marked so they stand out from source tokens.
 */
export function formatCst(node: CstNode, indent = 0): string {
  const pad = "  ".repeat(indent)
  if (node.kind === "token") {
    const marker = node.synthetic ? " /*synthetic*/" : ""
    return `${pad}${node.name} ${JSON.stringify(node.text)}${marker}`
  }
  if (node.children.length === 0) {
    return `${pad}(${node.name})`
  }
  const inner = node.children.map((c) => formatCst(c, indent + 1)).join("\n")
  return `${pad}(${node.name}\n${inner})`
}

/** Yield every node in the tree, parents before children (pre-order). */
export function* walkCst(node: CstNode): Generator<CstNode> {
  yield node
  if (node.kind === "rule") {
    for (const c of node.children) yield* walkCst(c)
  }
}

/**
 * Yield leaf tokens in source order.  Synthetic tokens (injected SEMI/EOF)
 * are skipped by default; pass `{ includeSynthetic: true }` to see them.
 */
export function* tokenLeaves(
  node: CstNode,
  opts: { includeSynthetic?: boolean } = {},
): Generator<TokenNode> {
  const includeSynthetic = opts.includeSynthetic === true
  if (node.kind === "token") {
    if (includeSynthetic || !node.synthetic) yield node
    return
  }
  for (const c of node.children) yield* tokenLeaves(c, opts)
}

// Re-export the defs type so callers can import it without reaching
// into the engine module.
export type { ParserDefs } from "./lempar.ts"
export type { EnhancedParseDiagnostic } from "./enhanceError.ts"
