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

import { createTokenizer, type KeywordsDump } from './tokenize.ts';
import {
  createEngine,
  type DumpRhsPos,
  type DumpRule,
  type LalrPopped,
  type LemonDump,
} from './lempar.ts';

// ---------------------------------------------------------------------------
// CST node shapes.  These are emitter-defined — the engine knows
// nothing about them.
// ---------------------------------------------------------------------------

/** A leaf node — one token from the tokenizer. */
export interface TokenNode {
  readonly kind: 'token';
  /** Numeric TK_* code (matches lemon's terminal symbol id). */
  readonly type: number;
  /** Stringified TK_* name, e.g. `"SELECT"`, `"ID"`, `"INTEGER"`. */
  readonly name: string;
  /** Source text covered by the token. */
  readonly text: string;
  /** Byte offset of the token in the original source string. */
  readonly start: number;
  /** Length of the token in source characters. */
  readonly length: number;
}

/** An internal node — the result of a grammar reduction. */
export interface RuleNode {
  readonly kind: 'rule';
  /** Lemon rule id (matches `rules[ruleId]` in the dump). */
  readonly rule: number;
  /**
   * The nonterminal name on the left-hand side, e.g. `"select"`,
   * `"expr"`, `"cmdlist"`.  This is the natural CST label.
   */
  readonly name: string;
  /** Nonterminal symbol id. */
  readonly lhs: number;
  /** Direct children, in source order. */
  readonly children: readonly CstNode[];
  /** Source offset of the first child (or 0 for an empty reduction). */
  readonly start: number;
  /** Source length, from the first child's start to the last child's end. */
  readonly length: number;
}

export type CstNode = TokenNode | RuleNode;

export interface ParseError {
  /** Human-readable error message. */
  readonly message: string;
  /** The offending token, if we had one when the error was raised. */
  readonly token?: TokenNode;
}

export interface ParseResult {
  /** The CST root, present iff the parser reached YY_ACCEPT_ACTION. */
  readonly cst?: CstNode;
  /** Any errors encountered.  Non-empty implies either a partial or no CST. */
  readonly errors: readonly ParseError[];
}

// Internal — the stack-value type we hand to the engine.  `null`
// represents a virtual token (the synthetic SEMI or EOF marker we inject
// at end of input); those never become CST children but they still
// ride the stack so the engine can dispatch correctly.
type EngineValue = CstNode | null;

// ---------------------------------------------------------------------------
// createParser — bind the driver to a specific parser.json + keywords.json.
// ---------------------------------------------------------------------------

export function createParser(
  parserDump: LemonDump,
  keywordsDump: KeywordsDump,
) {
  const engine = createEngine(parserDump);
  const rules = parserDump.rules;

  // Symbol-id → display name (used to build the CST token names).
  // Mirrors yyTokenName[] in the generated parse.c.
  const symbolName: string[] = [];
  for (const sym of parserDump.symbols) symbolName[sym.id] = sym.name;

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
  const unitWrapper = new Map<number, Map<number, DumpRule>>();
  for (const r of rules) {
    if (r.doesReduce) continue;
    if (r.nrhs !== 1) continue;
    const src = r.rhs[0]?.symbol;
    if (src === undefined) continue;
    let inner = unitWrapper.get(r.lhs);
    if (!inner) unitWrapper.set(r.lhs, (inner = new Map()));
    inner.set(src, r);
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
  function rhsMatches(expected: DumpRhsPos, actualMajor: number): boolean {
    if (expected.symbol !== undefined) return expected.symbol === actualMajor;
    if (expected.multi !== undefined) {
      for (const s of expected.multi) if (s.symbol === actualMajor) return true;
    }
    return false;
  }

  /**
   * If the node's symbol type is `actualMajor` but position `expected`
   * wants something else, wrap it in the invisible unit-rule node(s)
   * that Lemon elided.  Iterates in case a future version introduces
   * multi-step unit chains.
   */
  function synthesizeWrappers(
    expected: DumpRhsPos,
    actualMajor: number,
    node: CstNode,
  ): CstNode {
    let cur = node;
    let curMajor = actualMajor;
    for (let safety = 0; safety < 4; safety++) {
      if (rhsMatches(expected, curMajor)) break;
      // `expected.symbol` is the only target we know how to reach via
      // unit rules — if the expected position is a MULTITERMINAL set
      // and nothing matched, we've found a grammar invariant violation
      // rather than an elision.
      const target = expected.symbol;
      if (target === undefined) break;
      const wrapperRule = unitWrapper.get(target)?.get(curMajor);
      if (!wrapperRule) break;
      cur = {
        kind: 'rule',
        rule: wrapperRule.id,
        name: wrapperRule.lhsName,
        lhs: wrapperRule.lhs,
        children: [cur],
        start: cur.start,
        length: cur.length,
      };
      curMajor = wrapperRule.lhs;
    }
    return cur;
  }

  // Bind a tokenizer.  The parser uses the same TK_* ids the dump's
  // symbol table assigns, so everything stays in sync.
  const tk = createTokenizer(parserDump, keywordsDump);

  /** Token id 0 is Lemon's end-of-input marker (`$`). */
  const TK_EOF = 0;
  const TK_SEMI   = tk.tokens.SEMI;
  const TK_ILLEGAL = tk.tokens.ILLEGAL;

  // -------------------------------------------------------------------------
  // Build the RuleNode for a given reduction.  This is the engine's
  // `onReduce` callback — it runs once per reduction and returns the
  // new stack value.
  //
  // The work here is all CST-emitter: figuring out which popped entries
  // should become children (virtual tokens drop out), running unit-rule
  // synthesis, and tightening the span around non-empty children.
  // -------------------------------------------------------------------------
  function buildRuleNode(
    ruleId: number,
    popped: LalrPopped<EngineValue>[],
  ): EngineValue {
    const rule = rules[ruleId];

    // Walk popped entries alongside the rule's declared RHS.  Each
    // non-null entry becomes a child, possibly wrapped in synthetic
    // unit-rule nodes that Lemon elided.  Null entries — the virtual
    // SEMI/EOF the parse loop injects — have no source representation
    // and drop out.
    const children: CstNode[] = [];
    for (let i = 0; i < popped.length; i++) {
      const entry = popped[i];
      if (entry.value === null) continue;
      const rhsPos = rule.rhs[i];
      children.push(
        rhsPos
          ? synthesizeWrappers(rhsPos, entry.major, entry.value)
          : entry.value,
      );
    }

    // Compute the rule's span from its children.  Children with
    // length=0 don't contribute — they're either empty-RHS rules (no
    // source text to anchor to) or synthetic siblings.  Skipping them
    // keeps the span tight and prevents negative lengths when a
    // zero-length child appears at the end of the sequence.
    let start = 0;
    let length = 0;
    let sawSpan = false;
    for (const c of children) {
      if (c.length === 0) continue;
      if (!sawSpan) {
        start = c.start;
        sawSpan = true;
      }
      length = c.start + c.length - start;
    }

    const ruleNode: RuleNode = {
      kind: 'rule',
      rule: ruleId,
      name: rule.lhsName,
      lhs: rule.lhs,
      children,
      start,
      length,
    };
    return ruleNode;
  }

  // -------------------------------------------------------------------------
  // parse — public entry point.
  //
  // Tokenises the input, feeds it to the engine as a lazy iterable of
  // `{major, value}` pairs, and translates the engine's result into a
  // ParseResult with CST and user-facing error messages.
  // -------------------------------------------------------------------------
  function parse(sql: string): ParseResult {
    const errors: ParseError[] = [];

    // Collect inputs into an array so we can pre-check for ILLEGAL
    // tokens and inject virtual SEMI/EOF tails before driving the
    // engine.  SQL strings are small; streaming isn't worth it here.
    const inputs: Array<{ major: number; value: EngineValue }> = [];
    let lastMajor = -1;
    for (const tok of tk.tokenize(sql)) {
      if (tok.type === TK_ILLEGAL) {
        // sqlite's tokenize.c:707 formats it as: unrecognized token.
        // We record it and bail — attempting to recover typically
        // cascades into noise.
        const text = sql.slice(tok.start, tok.start + tok.length);
        errors.push({
          message: `unrecognized token: ${JSON.stringify(text)}`,
        });
        return { errors };
      }

      const node: TokenNode = {
        kind: 'token',
        type: tok.type,
        name: symbolName[tok.type] ?? String(tok.type),
        text: sql.slice(tok.start, tok.start + tok.length),
        start: tok.start,
        length: tok.length,
      };
      inputs.push({ major: tok.type, value: node });
      lastMajor = tok.type;
    }

    // EOF tail — mirrors tokenize.c:674 sqlite3RunParser.  If the last
    // real token wasn't a SEMI, feed a virtual one to close the
    // current statement.  Then feed 0 (end-of-input marker) to trigger
    // the final reduce/accept.
    if (lastMajor !== TK_SEMI) {
      inputs.push({ major: TK_SEMI, value: null });
    }
    inputs.push({ major: TK_EOF, value: null });

    const result = engine.run<EngineValue>(inputs, buildRuleNode);

    // Translate engine errors into user-facing ParseErrors.  The engine
    // tells us what state/major/value were at the point of failure; we
    // frame it as a syntax-error message with token text for context.
    for (const e of result.errors) {
      const v = e.value;
      const tokName = symbolName[e.major] ?? String(e.major);
      errors.push({
        message:
          v && v.kind === 'token'
            ? `syntax error near "${v.text}"`
            : v && v.kind === 'rule'
              ? `syntax error near ${v.name}`
              : `syntax error at end of input (unexpected ${tokName})`,
        token: v && v.kind === 'token' ? v : undefined,
      });
    }

    if (result.accepted && result.root) {
      return { cst: result.root, errors };
    }
    if (!result.accepted && errors.length === 0) {
      // Engine ran out of input without accepting — well-formed
      // grammars shouldn't allow this, but guard anyway.
      errors.push({ message: 'parser did not accept at end of input' });
    }
    return { errors };
  }

  // Expose the tokenizer too so callers can inspect raw tokens for
  // syntax highlighting / diagnostics without running a full parse.
  return {
    parse,
    tokenize: tk.tokenize,
    tokenName: tk.tokenName,
  };
}

// ---------------------------------------------------------------------------
// Helpers — tree walking and pretty-printing.
// ---------------------------------------------------------------------------

/**
 * Pretty-print a CST as indented S-expression-ish text.  Useful for
 * snapshot-style tests and quick inspection in a REPL.
 */
export function formatCst(node: CstNode, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (node.kind === 'token') {
    return `${pad}${node.name} ${JSON.stringify(node.text)}`;
  }
  if (node.children.length === 0) {
    return `${pad}(${node.name})`;
  }
  const inner = node.children.map((c) => formatCst(c, indent + 1)).join('\n');
  return `${pad}(${node.name}\n${inner})`;
}

/** Yield every node in the tree, parents before children (pre-order). */
export function* walkCst(node: CstNode): Generator<CstNode> {
  yield node;
  if (node.kind === 'rule') {
    for (const c of node.children) yield* walkCst(c);
  }
}

/** Yield only leaf tokens, in source order. */
export function* tokenLeaves(node: CstNode): Generator<TokenNode> {
  if (node.kind === 'token') {
    yield node;
    return;
  }
  for (const c of node.children) yield* tokenLeaves(c);
}

// Re-export the dump type so callers can import it without reaching
// into the engine module.
export type { LemonDump } from './lempar.ts';
