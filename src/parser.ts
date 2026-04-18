// CST-building LALR(1) parser for SQLite's SQL dialect.
//
// This is a TypeScript port of the driver in tool/lempar.c, with the
// semantic-action switch (which in C calls into SQLite internals) ripped
// out.  In its place, every reduction builds a uniform concrete syntax
// tree (CST) node from the RHS entries popped off the stack.  The parse
// tables themselves are consumed from parser.json, which the patched
// lemon emits alongside parse.c.
//
// Line references in comments point into tool/lempar.c in this checkout.
// Naming mirrors the C where helpful so porters can diff the two files
// side by side.

// @ts-ignore — tokenize.js is intentionally untyped; see conversation
// history for the decision to gradually port the surrounding modules.
import { createTokenizer } from './tokenize.js';

// ---------------------------------------------------------------------------
// Dump shapes (subset) — only what the driver reads.
// ---------------------------------------------------------------------------

interface LemonConstants {
  YYNSTATE: number;
  YYNRULE: number;
  YYNTOKEN: number;
  YYNSYMBOL: number;
  YY_MAX_SHIFT: number;
  YY_MIN_SHIFTREDUCE: number;
  YY_MAX_SHIFTREDUCE: number;
  YY_ERROR_ACTION: number;
  YY_ACCEPT_ACTION: number;
  YY_NO_ACTION: number;
  YY_MIN_REDUCE: number;
  YY_MAX_REDUCE: number;
  YY_ACTTAB_COUNT: number;
  YY_SHIFT_COUNT: number;
  YY_REDUCE_COUNT: number;
  YYWILDCARD: number;   // -1 if grammar has no %wildcard
  YYFALLBACK: 0 | 1;
}

interface LemonTables {
  yy_action: number[];
  yy_lookahead: number[];
  yy_shift_ofst: number[];
  yy_reduce_ofst: number[];
  yy_default: number[];
  yyFallback?: number[];
}

interface DumpSymbol {
  id: number;
  name: string;
  isTerminal: boolean;
}

interface DumpRhsPos {
  pos: number;
  /** Single terminal/nonterminal symbol id at this position. */
  symbol?: number;
  /** For `%token_class foo A|B|C` positions, the set of accepted symbols. */
  multi?: Array<{ symbol: number; name: string }>;
  name?: string;
}

interface DumpRule {
  id: number;
  lhs: number;
  lhsName: string;
  nrhs: number;
  rhs: DumpRhsPos[];
  /**
   * `false` when Lemon's unit-rule elimination proved this reduction
   * never fires — lemon's action tables skip straight to the enclosing
   * rule.  We reconstruct these invisible nodes at parse time so the
   * CST still reflects the authored grammar.
   */
  doesReduce: boolean;
}

export interface LemonDump {
  constants: LemonConstants;
  tables: LemonTables;
  symbols: DumpSymbol[];
  rules: DumpRule[];
}

// ---------------------------------------------------------------------------
// CST node shapes.
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

// ---------------------------------------------------------------------------
// Stack entry — tracks parser state and the CST subtree built so far.
// ---------------------------------------------------------------------------
interface StackEntry {
  /** Lemon state number, or a pending-reduce action > YY_MAX_SHIFT. */
  stateno: number;
  /** Symbol id that took us to this state (0 for the bottom sentinel). */
  major: number;
  /** CST payload, or null for the sentinel / virtual-EOF frames. */
  node: CstNode | null;
}

// ---------------------------------------------------------------------------
// createParser — bind the driver to a specific parser.json + keywords.json.
//
// Returns `{ parse(sql) }`.  The parser is reusable across calls; it
// allocates a fresh stack on every invocation.
// ---------------------------------------------------------------------------

export function createParser(
  parserDump: LemonDump,
  // @ts-ignore — keywords dump shape lives in the untyped util/tokenizer.
  keywordsDump: unknown,
) {
  const K = parserDump.constants;
  const T = parserDump.tables;
  const yyFallback = T.yyFallback ?? [];
  const rules = parserDump.rules;

  // Symbol-id → display name (used to build the CST token names).  This
  // mirrors yyTokenName[] in the generated parse.c.
  const symbolName: string[] = [];
  for (const sym of parserDump.symbols) symbolName[sym.id] = sym.name;

  // --- Unit-rule-elimination recovery ----------------------------------
  //
  // Lemon's table generator marks unit rules like `cmdlist ::= ecmd` as
  // `doesReduce=false` and folds them into surrounding reductions —
  // e.g. `input ::= cmdlist` pops what LOOKS like an ecmd off the stack
  // and treats it as a cmdlist.  For a CST that reflects the authored
  // grammar we need to re-synthesize those invisible wrapper nodes at
  // reduction time.
  //
  // `unitWrapper[target][source]` is the rule to apply when we pop a
  // symbol of type `source` where a symbol of type `target` was
  // expected.  For the SQLite grammar all 14 collapsed rules are 1:1
  // unit rules, so a single lookup suffices.
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

  /**
   * Does `actualMajor` satisfy the RHS-position `expected` constraint?
   * A single-symbol position matches by id; a MULTITERMINAL position
   * matches any of its alternatives.
   */
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
   * that Lemon elided.  Returns `[wrappedNode, finalMajor]`.  For our
   * grammar the wrapping is always a single step; we iterate just in
   * case a future version adds chains.
   */
  function synthesizeWrappers(
    expected: DumpRhsPos,
    actualMajor: number,
    node: CstNode,
  ): { node: CstNode; major: number } {
    let cur = node;
    let curMajor = actualMajor;
    for (let safety = 0; safety < 4; safety++) {
      if (rhsMatches(expected, curMajor)) break;
      // `expected.symbol` is the only target we know how to reach via
      // unit rules — if the expected position is a MULTITERMINAL set,
      // any mismatch means the popped entry wasn't one of the allowed
      // terminals, which is a grammar invariant violation.
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
    return { node: cur, major: curMajor };
  }

  // Bind a tokenizer.  The parser uses the same TK_* ids the dump's
  // symbol table assigns, so everything stays in sync.
  // @ts-ignore — untyped JS import.
  const tk = createTokenizer(parserDump, keywordsDump);

  /** Token id 0 is Lemon's end-of-input marker (`$`). */
  const TK_EOF = 0;
  const TK_SEMI   = tk.tokens.SEMI   as number;
  const TK_ILLEGAL = tk.tokens.ILLEGAL as number;

  // -------------------------------------------------------------------------
  // Table lookups — faithful ports of lempar.c:549 and lempar.c:614.
  // -------------------------------------------------------------------------

  /**
   * Given the current state and next terminal token, return the parser
   * action to take.  The action is interpreted by the caller (shift,
   * shift-reduce, reduce, accept, or error — see the encoding below).
   *
   * lempar.c:549 yy_find_shift_action.
   */
  function findShiftAction(lookahead: number, stateno: number): number {
    // When `stateno` already encodes a pending reduce (> YY_MAX_SHIFT),
    // yy_find_shift_action in C returns it verbatim so the caller can
    // dispatch straight to the reduce branch.
    if (stateno > K.YY_MAX_SHIFT) return stateno;

    let la = lookahead;
    while (true) {
      const base = T.yy_shift_ofst[stateno];
      const i = base + la;
      if (T.yy_lookahead[i] !== la) {
        // (1) %fallback — a keyword falling back to its identifier form.
        if (K.YYFALLBACK && la < yyFallback.length) {
          const iFallback = yyFallback[la];
          if (iFallback !== 0) {
            la = iFallback;
            continue; // retry with the fallback symbol id
          }
        }
        // (2) %wildcard — see lempar.c:586.  The wildcard is consulted
        // only after fallback fails, and only when the lookahead is a
        // real terminal (la > 0).
        if (K.YYWILDCARD > 0) {
          const j = i - la + K.YYWILDCARD;
          if (
            j >= 0 &&
            j < T.yy_lookahead.length &&
            T.yy_lookahead[j] === K.YYWILDCARD &&
            la > 0
          ) {
            return T.yy_action[j];
          }
        }
        // (3) Fall back to the default action for this state.
        return T.yy_default[stateno];
      }
      return T.yy_action[i];
    }
  }

  /**
   * GOTO table lookup after a reduction.  Given the state we're about
   * to return to and the nonterminal we just produced, return the next
   * state (as an action code — see encoding).
   *
   * lempar.c:614 yy_find_reduce_action.
   */
  function findReduceAction(stateno: number, lookahead: number): number {
    // With no error symbol, lempar.c asserts stateno <= YY_REDUCE_COUNT
    // and the table lookup always succeeds.  We defensively fall back
    // to yy_default on out-of-range input.
    if (stateno > K.YY_REDUCE_COUNT) return T.yy_default[stateno];

    const i = T.yy_reduce_ofst[stateno] + lookahead;
    if (
      i < 0 ||
      i >= K.YY_ACTTAB_COUNT ||
      T.yy_lookahead[i] !== lookahead
    ) {
      return T.yy_default[stateno];
    }
    return T.yy_action[i];
  }

  // -------------------------------------------------------------------------
  // Parse entry point.
  // -------------------------------------------------------------------------

  function parse(sql: string): ParseResult {
    // stack[0] is a bottom sentinel — mirrors lempar.c's yystack[0]
    // which has stateno=0 and an unused major.  Everything above it is
    // a real parse entry.
    const stack: StackEntry[] = [
      { stateno: 0, major: 0, node: null },
    ];
    const errors: ParseError[] = [];
    let root: CstNode | undefined;

    // ----- Reduce: pop nrhs children, build RuleNode, run the GOTO. ----
    // Matches the non-action-switch half of lempar.c:742 yy_reduce.
    function doReduce(ruleno: number): void {
      const rule = rules[ruleno];
      const lhs = rule.lhs;
      const nrhs = rule.nrhs;

      // Pop nrhs entries off the stack (they came in source order but
      // we popped last-first, so reverse at the end).
      const popped: StackEntry[] = [];
      for (let i = 0; i < nrhs; i++) popped.push(stack.pop()!);
      popped.reverse();

      // Walk popped entries alongside the rule's declared RHS.  Each
      // non-null entry becomes a child, possibly wrapped in one or more
      // synthetic unit-rule nodes that Lemon's table generator elided
      // (see `unitWrapper` construction above).  Null entries — the
      // virtual SEMI/EOF the driver injects at end-of-input — have no
      // source representation and are dropped.
      const children: CstNode[] = [];
      for (let i = 0; i < popped.length; i++) {
        const entry = popped[i];
        if (entry.node === null) continue;
        const rhsPos = rule.rhs[i];
        if (rhsPos === undefined) {
          children.push(entry.node);
          continue;
        }
        const wrapped = synthesizeWrappers(rhsPos, entry.major, entry.node);
        children.push(wrapped.node);
      }

      // Compute the rule's span from its children.  Children with
      // length=0 don't contribute — they're either empty-RHS rules (no
      // source text to anchor to) or virtual siblings.  Skipping them
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
        rule: ruleno,
        name: rule.lhsName,
        lhs,
        children,
        start,
        length,
      };

      // Find the GOTO and push the new (nonterminal, rule-node) entry.
      // In C, yy_reduce stores yyact directly as stateno; that value may
      // be a normal state, a pending-reduce (>=YY_MIN_REDUCE), or a
      // shift-reduce (but never the last case on a nonterminal — see
      // lempar.c:778).
      const baseState = stack[stack.length - 1].stateno;
      const act = findReduceAction(baseState, lhs);
      stack.push({ stateno: act, major: lhs, node: ruleNode });
    }

    // ----- Feed one token to the parser ------------------------------
    // Returns one of three outcomes.  Matches the while(1) loop in
    // lempar.c:915.
    function feed(
      major: number,
      node: CstNode | null,
    ): 'continue' | 'accepted' | 'errored' {
      let act = stack[stack.length - 1].stateno;
      while (true) {
        act = findShiftAction(major, act);

        if (act >= K.YY_MIN_REDUCE) {
          // (1) Pure reduce, possibly chained.  Rule = act - YY_MIN_REDUCE.
          const ruleno = act - K.YY_MIN_REDUCE;
          doReduce(ruleno);
          act = stack[stack.length - 1].stateno;
          continue; // retry with the same token against the new state
        }

        if (act <= K.YY_MAX_SHIFTREDUCE) {
          // (2) Shift, or combined shift+reduce.
          //
          // For SHIFTREDUCE actions (YY_MIN_SHIFTREDUCE..YY_MAX_SHIFTREDUCE),
          // lempar.c:709 rewrites the stored state so that the next
          // findShiftAction dispatches straight into the pending reduce.
          let newState = act;
          if (newState > K.YY_MAX_SHIFT) {
            newState += K.YY_MIN_REDUCE - K.YY_MIN_SHIFTREDUCE;
          }
          stack.push({ stateno: newState, major, node });
          return 'continue';
        }

        if (act === K.YY_ACCEPT_ACTION) {
          // (3) Accept.  The CST root is at the top of the stack.
          root = stack[stack.length - 1].node ?? undefined;
          return 'accepted';
        }

        // Anything else (including YY_ERROR_ACTION and YY_NO_ACTION) is
        // a syntax error.  Without error recovery (we mirror sqlite's
        // YYNOERRORRECOVERY build flag) we just record and bail.
        const tokenName = symbolName[major] ?? String(major);
        errors.push({
          message: node
            ? `syntax error near "${node.kind === 'token' ? node.text : node.name}"`
            : `syntax error at end of input (unexpected ${tokenName})`,
          token: node?.kind === 'token' ? node : undefined,
        });
        return 'errored';
      }
    }

    // ----- Tokenize and drive the parser ------------------------------
    let lastMajor = -1;
    for (const tok of tk.tokenize(sql)) {
      if (tok.type === TK_ILLEGAL) {
        // sqlite's tokenize.c:707 would say: unrecognized token.  We
        // record it and stop — recovering would require swallowing the
        // token, which often just produces cascading errors.
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

      const outcome = feed(tok.type, node);
      if (outcome === 'errored') return { errors };
      if (outcome === 'accepted') return { cst: root, errors };
      lastMajor = tok.type;
    }

    // ----- EOF handling, mirroring tokenize.c:674 ---------------------
    // If the last real token wasn't a SEMI, feed a virtual one to close
    // the current statement.  Then feed 0 (end-of-input marker) to
    // trigger the final reduce/accept.
    if (lastMajor !== TK_SEMI) {
      const r = feed(TK_SEMI, null);
      if (r === 'errored') return { errors };
      if (r === 'accepted') return { cst: root, errors };
    }
    const r = feed(TK_EOF, null);
    if (r === 'accepted') return { cst: root, errors };
    if (r === 'errored') return { errors };

    // The parser returned 'continue' from the EOF feed — should be
    // impossible with a well-formed grammar, but guard against it.
    errors.push({ message: 'parser did not accept at end of input' });
    return { errors };
  }

  // Expose the tokenizer too so callers can inspect raw tokens for
  // syntax highlighting / diagnostics without running a full parse.
  return {
    parse,
    tokenize: tk.tokenize as (sql: string) => Iterable<{ type: number; start: number; length: number }>,
    tokenName: tk.tokenName as (code: number) => string | undefined,
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
