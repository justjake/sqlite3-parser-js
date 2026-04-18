// LALR(1) state-machine driver for Lemon-generated grammars.
//
// This file is the JavaScript/TypeScript counterpart of tool/lempar.c
// — Lemon's runtime parser template.  It is a deliberate 1:1 port of
// the dispatch loop and table helpers in that C file.  It knows
// nothing about concrete syntax trees, tokens-as-source-text, SQL
// semantics, or any SQLite-specific concern.  It only knows how to:
//
//   * look up the parser action for (state, terminal) pairs,
//   * perform the shift / shift-reduce / reduce / accept / error
//     dispatch,
//   * drive the state-table-driven LR(1) stack.
//
// Every divergence from lempar.c lives in src/parser.ts (the CST
// emitter) — never here.  Line-number references to tool/lempar.c in
// this file are kept in sync with the sqlite checkout you see in git;
// future ports of upstream lempar.c changes should diff this file
// against the updated C, checking that each `lempar.c:NNN` citation
// still points at the right code.
//
// Generic parameter `V` is the caller's stack-value type.  The engine
// stores one `V` per stack entry (alongside the state number and the
// symbol's major id), passes popped entries to `onReduce`, and returns
// the final top-of-stack value as the accepted root.  The engine never
// looks inside `V` — the caller's reducer is the only thing that does.

// ---------------------------------------------------------------------------
// Branded number types.
//
// These catch the most common source of silent bugs when refactoring:
// mixing up the different integer namespaces Lemon uses.  All three
// are zero-cost at runtime — they're plain `number`s under the hood.
//
// * SymbolId covers any grammar symbol (terminal OR nonterminal) in
//   the single integer namespace Lemon uses for its symbol table.
// * TokenId is the subset where the symbol is a terminal; it's a
//   subtype of SymbolId so a TokenId can flow anywhere a SymbolId is
//   accepted, but not the other way around.
// * RuleId indexes into `dump.rules[]`.
//
// State numbers and action codes are intentionally NOT branded: Lemon
// packs shift state numbers, `YY_ACCEPT_ACTION`, and pending-reduce
// encodings (stateno > YY_MAX_SHIFT) into the same field.  Branding
// them apart would force casts on the main dispatch path for no safety
// benefit.
//
// Brand helpers are exposed for the rare cases where you really do
// have a raw number (test fixtures, REPL poking) — production code
// should let the interface types propagate.
// ---------------------------------------------------------------------------
declare const __symbolIdBrand: unique symbol;
declare const __tokenIdBrand: unique symbol;
declare const __ruleIdBrand: unique symbol;

/** Any grammar symbol — terminal or nonterminal.  0..YYNSYMBOL. */
export type SymbolId = number & { readonly [__symbolIdBrand]: true };

/**
 * A terminal symbol (TK_* code) — subtype of SymbolId.  0..YYNTOKEN.
 * Any API that accepts a SymbolId also accepts a TokenId.
 */
export type TokenId = SymbolId & { readonly [__tokenIdBrand]: true };

/** Index into `dump.rules[]`.  0..YYNRULE. */
export type RuleId = number & { readonly [__ruleIdBrand]: true };

/** Coerce a plain number to `SymbolId` (unsafe — caller asserts range). */
export const SymbolId = (n: number): SymbolId => n as SymbolId;
/** Coerce a plain number to `TokenId` (unsafe — caller asserts range). */
export const TokenId  = (n: number): TokenId  => n as TokenId;
/** Coerce a plain number to `RuleId` (unsafe — caller asserts range). */
export const RuleId   = (n: number): RuleId   => n as RuleId;

// ---------------------------------------------------------------------------
// Dump shapes.  Only the fields the LALR engine actually reads.
// ---------------------------------------------------------------------------

export interface LemonConstants {
  /** Number of LALR states. */
  YYNSTATE: number;
  /** Number of grammar rules. */
  YYNRULE: number;
  /** Number of terminal symbols (token alphabet size). */
  YYNTOKEN: number;
  /** Total number of symbols (terminals + nonterminals). */
  YYNSYMBOL: number;
  /** Highest state number that represents a pure shift. */
  YY_MAX_SHIFT: number;
  /** Range [YY_MIN_SHIFTREDUCE, YY_MAX_SHIFTREDUCE]: combined shift+reduce. */
  YY_MIN_SHIFTREDUCE: number;
  YY_MAX_SHIFTREDUCE: number;
  /** Singleton action codes. */
  YY_ERROR_ACTION: number;
  YY_ACCEPT_ACTION: number;
  YY_NO_ACTION: number;
  /** Range [YY_MIN_REDUCE, YY_MAX_REDUCE]: pure reduce by rule. */
  YY_MIN_REDUCE: number;
  YY_MAX_REDUCE: number;
  /** Length of the action/lookahead table. */
  YY_ACTTAB_COUNT: number;
  /** Length of yy_shift_ofst / yy_reduce_ofst. */
  YY_SHIFT_COUNT: number;
  YY_REDUCE_COUNT: number;
  /** Terminal symbol id for `%wildcard`, or -1 if the grammar has none. */
  YYWILDCARD: number;
  /** 1 iff the grammar declared any `%fallback` directives. */
  YYFALLBACK: 0 | 1;
}

export interface LemonTables {
  yy_action: number[];
  /** Indexed by base+lookahead; each entry is a terminal SymbolId. */
  yy_lookahead: SymbolId[];
  yy_shift_ofst: number[];
  yy_reduce_ofst: number[];
  yy_default: number[];
  /** Terminal-id → fallback-terminal-id.  Present iff YYFALLBACK=1. */
  yyFallback?: TokenId[];
}

export interface DumpSymbol {
  id: SymbolId;
  name: string;
  isTerminal: boolean;
}

export interface DumpRhsPos {
  pos: number;
  /** Single terminal/nonterminal symbol id at this position. */
  symbol?: SymbolId;
  /** For `%token_class foo A|B|C` positions, the set of accepted symbols. */
  multi?: Array<{ symbol: SymbolId; name: string }>;
  name?: string;
}

export interface DumpRule {
  id: RuleId;
  lhs: SymbolId;
  lhsName: string;
  nrhs: number;
  rhs: DumpRhsPos[];
  /**
   * `false` when Lemon's unit-rule elimination proved this reduction
   * never fires.  The engine doesn't care — it follows the tables
   * faithfully — but CST emitters will want to reconstruct these
   * invisible wrapper nodes.  See src/parser.ts for the synthesis.
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
// Engine API.
// ---------------------------------------------------------------------------

/** One input token to the engine.  Inputs are always terminals. */
export interface LalrInput<V> {
  readonly major: TokenId;
  readonly value: V;
}

/**
 * One popped stack entry handed to the reducer.  `major` is widened to
 * `SymbolId` because a popped entry may be either the token we shifted
 * (a TokenId) or a nonterminal we previously reduced (a SymbolId).
 */
export interface LalrPopped<V> {
  readonly major: SymbolId;
  readonly value: V;
}

/**
 * Called once per reduction.  The engine has already popped the RHS
 * entries off the stack and reversed them into source order before
 * calling you.  Your return value is pushed back as the LHS entry's
 * `value`.
 */
export type LalrReduce<V> = (ruleId: RuleId, popped: LalrPopped<V>[]) => V;

/** A single parse error reported by the engine. */
export interface LalrError<V> {
  /** Parser state number at the time of failure. */
  readonly stateno: number;
  /** Terminal that couldn't be parsed in the current state. */
  readonly major: TokenId;
  /** Value of that token, as supplied by the caller. */
  readonly value: V;
  /** 0-based index of the failing token within the input iterable. */
  readonly inputIndex: number;
}

export interface LalrResult<V> {
  /** Did the parser reach YY_ACCEPT_ACTION? */
  readonly accepted: boolean;
  /** The final top-of-stack value when accepted. */
  readonly root?: V;
  /** Any errors collected before stopping. */
  readonly errors: readonly LalrError<V>[];
}

export interface LalrEngine {
  /**
   * Drive the state machine over `tokens`.
   *
   * The last input MUST have `major === 0` (Lemon's end-of-input
   * marker, `$`) to trigger the final reduce/accept sequence.  Callers
   * that want a pre-EOF virtual token (e.g. a synthetic SEMI to
   * terminate SQL statements) should inject it into the iterable
   * themselves before the end marker.
   *
   * On the first YY_ERROR_ACTION encountered the engine records an
   * error and stops — there is no error recovery (mirrors sqlite's
   * `#define YYNOERRORRECOVERY 1` build flag; see parse.y:76).
   */
  run<V>(tokens: Iterable<LalrInput<V>>, onReduce: LalrReduce<V>): LalrResult<V>;
}

// ---------------------------------------------------------------------------
// Implementation.
// ---------------------------------------------------------------------------

/**
 * Bind the engine to a specific Lemon grammar dump.  Returns a reusable
 * `run` function.  Constructing the engine is cheap — the tables are
 * referenced, not copied — so callers can create one per grammar and
 * parse arbitrarily many strings through it.
 */
export function createEngine(dump: LemonDump): LalrEngine {
  const K = dump.constants;
  const T = dump.tables;
  const yyFallback = T.yyFallback ?? [];
  const rules = dump.rules;

  // -------------------------------------------------------------------------
  // Table lookups — faithful ports of lempar.c:549 and lempar.c:614.
  // -------------------------------------------------------------------------

  /**
   * Given the current state and next terminal token, return the parser
   * action to take.  The action's encoding (shift / shift-reduce /
   * reduce / accept / error) is decoded by `run`'s dispatch loop below.
   *
   * lempar.c:549 yy_find_shift_action.
   */
  function findShiftAction(lookahead: TokenId, stateno: number): number {
    // When `stateno` already encodes a pending reduce (> YY_MAX_SHIFT),
    // yy_find_shift_action in C returns it verbatim so the caller can
    // dispatch straight to the reduce branch.
    if (stateno > K.YY_MAX_SHIFT) return stateno;

    let la: TokenId = lookahead;
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
   * lempar.c:614 yy_find_reduce_action.  Note: `lookahead` here is the
   * LHS of the just-reduced rule, so it's a `SymbolId` (nonterminal),
   * not a `TokenId` like in findShiftAction.
   */
  function findReduceAction(stateno: number, lookahead: SymbolId): number {
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
  // Stack entry.  Mirrors lempar.c's struct yyStackEntry: {stateno,
  // major, minor}.  The sentinel at index 0 has stateno=0 and an
  // undefined value — we never pop it, so the value is never handed to
  // the reducer.
  // -------------------------------------------------------------------------
  interface StackEntry<V> {
    stateno: number;
    major: SymbolId;
    value: V;
  }

  function run<V>(
    tokens: Iterable<LalrInput<V>>,
    onReduce: LalrReduce<V>,
  ): LalrResult<V> {
    // The bottom sentinel's value is synthesised as `undefined as V`;
    // because we never pop it, the caller's reducer never observes the
    // cast.  Using an explicit sentinel matches lempar.c's yystack[0].
    const stack: StackEntry<V>[] = [
      { stateno: 0, major: 0 as SymbolId, value: undefined as V },
    ];
    const errors: LalrError<V>[] = [];
    let accepted = false;
    let root: V | undefined;

    // ---- Reduce: pop nrhs entries, call onReduce, run GOTO, push ----
    // The non-action-switch half of lempar.c:742 yy_reduce.
    function doReduce(ruleId: RuleId): void {
      const rule = rules[ruleId];
      const lhs = rule.lhs;
      const nrhs = rule.nrhs;

      // Pop nrhs entries into `popped`, in source order.  We pop
      // last-first and reverse so that popped[i] corresponds to the
      // rule's i-th RHS position.
      const popped: LalrPopped<V>[] = [];
      for (let i = 0; i < nrhs; i++) {
        const e = stack.pop()!;
        popped.push({ major: e.major, value: e.value });
      }
      popped.reverse();

      // Hand them to the caller's reducer; the returned value becomes
      // the new stack entry's value.
      const value = onReduce(ruleId, popped);

      // GOTO — see lempar.c:772 yyact = yy_find_reduce_action(...).
      const baseState = stack[stack.length - 1].stateno;
      const act = findReduceAction(baseState, lhs);
      stack.push({ stateno: act, major: lhs, value });
    }

    // ---- Main dispatch loop (lempar.c:915) --------------------------
    let inputIndex = 0;
    for (const tok of tokens) {
      const major: TokenId = tok.major;
      const value = tok.value;

      // Equivalent to Parse()'s while(1) loop: keep reducing until the
      // state can accept this token (or decide it's an error).
      let act = stack[stack.length - 1].stateno;
      let settled = false;
      while (!settled) {
        // Capture the state we're about to query *before* findShiftAction
        // rewrites `act` into an action code.  Needed for error reporting
        // (diagnostics want the state at the point of failure, not the
        // YY_ERROR_ACTION sentinel).  Inside this loop, at this point,
        // `act` is always a state number: either the initial
        // stack[top].stateno, or the post-reduce state we fetched below.
        const stateBeforeLookup = act;
        act = findShiftAction(major, act);

        if (act >= K.YY_MIN_REDUCE) {
          // (1) Pure reduce, possibly chained.  Rule = act - YY_MIN_REDUCE.
          const ruleId = (act - K.YY_MIN_REDUCE) as RuleId;
          doReduce(ruleId);
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
          stack.push({ stateno: newState, major, value });
          settled = true;
          break;
        }

        if (act === K.YY_ACCEPT_ACTION) {
          // (3) Accept.  Per lempar.c:965, yytos-- then yy_accept.  We
          // capture the top value first (that's the CST root or
          // semantic value the reducer built).
          root = stack[stack.length - 1].value;
          accepted = true;
          return { accepted, root, errors };
        }

        // (4) Anything else is YY_ERROR_ACTION or YY_NO_ACTION.
        errors.push({ stateno: stateBeforeLookup, major, value, inputIndex });
        return { accepted: false, errors };
      }

      inputIndex++;
    }

    // The caller should have terminated the stream with major=0.  If
    // they didn't, we've exhausted the input without accepting.
    return { accepted, root, errors };
  }

  return { run };
}
