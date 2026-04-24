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
// Names mirror lempar.c where an equivalent exists:
//
//   Ours                              lempar.c / parse.c
//   --------------------------------  -----------------------------------
//   engineModuleForGrammar(defs)      — (C bakes tables in at codegen)
//   CreateLalrEngine (the factory)    ParseAlloc(mallocProc, pCtx)
//   LalrEngine<V> (the session)       struct yyParser (the handle)
//   yyStackEntry<V>                   struct yyStackEntry { stateno, major, minor }
//   session.next(major, minor)        void Parse(yyp, yymajor, yyminor, …)
//   yy_find_shift_action              yy_find_shift_action
//   yy_find_reduce_action             yy_find_reduce_action
//   #yy_reduce                        yy_reduce
//
// `session.state`, `session.root`, and `session.errors` have no
// yyParser equivalent — C side-effects those onto the user's %extra
// argument (`pParse`) via `sqlite3ErrorMsg`.  Our reducer is pure, so
// the session has to hold the top-of-stack value to return as `root`.
//
// Generic parameter `V` is the caller's stack-value type (the C side
// calls this YYMINORTYPE — a union over all `%type` declarations).
// The engine stores one `V` per stack entry alongside the state number
// and the symbol's major id, passes popped entries to `reducer`, and
// returns the final top-of-stack value as the accepted root.  The
// engine never looks inside `V` — the caller's reducer is the only
// thing that does.

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
// * RuleId indexes into `defs.rules[]`.
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
import type { Span } from "./tokenize.ts"

declare const __symbolIdBrand: unique symbol
declare const __tokenIdBrand: unique symbol
declare const __ruleIdBrand: unique symbol

/** Any grammar symbol — terminal or nonterminal.  0..YYNSYMBOL. */
export type SymbolId = number & { readonly [__symbolIdBrand]: true }

/**
 * A terminal symbol (TK_* code) — subtype of SymbolId.  0..YYNTOKEN.
 * Any API that accepts a SymbolId also accepts a TokenId.
 */
export type TokenId = SymbolId & { readonly [__tokenIdBrand]: true }

/** Index into `defs.rules[]`.  0..YYNRULE. */
export type RuleId = number & { readonly [__ruleIdBrand]: true }

/** Coerce a plain number to `SymbolId` (unsafe — caller asserts range). */
export const SymbolId = (n: number): SymbolId => n as SymbolId
/** Coerce a plain number to `TokenId` (unsafe — caller asserts range). */
export const TokenId = (n: number): TokenId => n as TokenId
/** Coerce a plain number to `RuleId` (unsafe — caller asserts range). */
export const RuleId = (n: number): RuleId => n as RuleId

// ---------------------------------------------------------------------------
// Dump shapes.  Only the fields the LALR engine actually reads.
// ---------------------------------------------------------------------------

export interface ParserConstants {
  /** Number of LALR states. */
  YYNSTATE: number
  /** Number of grammar rules. */
  YYNRULE: number
  /** Number of terminal symbols (token alphabet size). */
  YYNTOKEN: number
  /** Total number of symbols (terminals + nonterminals). */
  YYNSYMBOL: number
  /** Highest state number that represents a pure shift. */
  YY_MAX_SHIFT: number
  /** Range [YY_MIN_SHIFTREDUCE, YY_MAX_SHIFTREDUCE]: combined shift+reduce. */
  YY_MIN_SHIFTREDUCE: number
  YY_MAX_SHIFTREDUCE: number
  /** Singleton action codes. */
  YY_ERROR_ACTION: number
  YY_ACCEPT_ACTION: number
  YY_NO_ACTION: number
  /** Range [YY_MIN_REDUCE, YY_MAX_REDUCE]: pure reduce by rule. */
  YY_MIN_REDUCE: number
  YY_MAX_REDUCE: number
  /** Length of the action/lookahead table. */
  YY_ACTTAB_COUNT: number
  /** Length of yy_shift_ofst / yy_reduce_ofst. */
  YY_SHIFT_COUNT: number
  YY_REDUCE_COUNT: number
  /** Terminal symbol id for `%wildcard`, or -1 if the grammar has none. */
  YYWILDCARD: number
  /** 1 iff the grammar declared any `%fallback` directives. */
  YYFALLBACK: 0 | 1
}

export interface ParserTables {
  yy_action: number[]
  /** Indexed by base+lookahead; each entry is a terminal SymbolId. */
  yy_lookahead: SymbolId[]
  yy_shift_ofst: number[]
  yy_reduce_ofst: number[]
  yy_default: number[]
  /** Terminal-id → fallback-terminal-id.  Present iff YYFALLBACK=1. */
  yyFallback?: TokenId[]
  /**
   * For rule J, `yyRuleInfoLhs[J]` is the LHS nonterminal's SymbolId.
   * Ported from lempar.c:720 `yyRuleInfoLhs[]` — lets the reduce
   * dispatch look up the GOTO target without materialising full
   * rule objects on the runtime hot path.
   */
  yyRuleInfoLhs: SymbolId[]
  /**
   * For rule J, `yyRuleInfoNRhs[J]` is the number of RHS symbols to
   * pop before calling the reducer.  Ported from lempar.c:726
   * `yyRuleInfoNRhs[]` (which stores the negative — we store positive
   * because our stack is a JS array we pop from, not a pointer-indexed
   * slab).
   */
  yyRuleInfoNRhs: number[]
  /**
   * Per-state sorted list of terminal ids the grammar would shift (or
   * shift-reduce, or accept) from this state.  Precomputed at
   * slim-dump time so error diagnostics can read the "expected" set in
   * O(|accepted|) instead of iterating every terminal.  Optional —
   * older prod dumps generated before this field was added still load,
   * and {@link errors} falls back to the per-terminal scan.
   */
  yy_expected?: TokenId[][]
}

// Symbol / rule / rhs-position shapes after slim-dump strips the
// fields that are recoverable from array position.  Callers that need
// a SymbolId / RuleId use the element's index in the owning array.

export interface ParserSymbol {
  name: string
  isTerminal: boolean
}

export interface ParserRhsPos {
  /** Single terminal/nonterminal symbol id at this position. */
  symbol?: SymbolId
  /** For `%token_class foo A|B|C` positions, the set of accepted symbols. */
  multi?: Array<{ symbol: SymbolId }>
}

export interface ParserRule {
  lhs: SymbolId
  lhsName: string
  rhs: ParserRhsPos[]
  /**
   * `false` when Lemon's unit-rule elimination proved this reduction
   * never fires.  The engine doesn't care — it follows the tables
   * faithfully — but CST emitters will want to reconstruct these
   * invisible wrapper nodes.  See src/parser.ts for the synthesis.
   */
  doesReduce: boolean
}

export type ParserSymbolNames = readonly string[]

export interface ParserDefs<Ctx = unknown, V = unknown> {
  constants: ParserConstants
  tables: ParserTables
  symbols: ParserSymbolNames
  reduce: LalrReduce<Ctx, V>
  createState: () => Ctx
}

// ---------------------------------------------------------------------------
// Engine API.
// ---------------------------------------------------------------------------

/**
 * One LR-stack entry.  Mirrors lempar.c's `struct yyStackEntry`:
 * `{ stateno, major, minor }`, with an added `span` field tracking the
 * input range this entry covers (a single token on shift, the union of
 * popped children on reduce).  The sentinel at index 0 has
 * `stateno: 0`, an undefined `minor`, and a zero-length span at offset
 * 0; the engine never pops it, so the caller's reducer never observes
 * the cast.
 */
export interface yyStackEntry<V> {
  readonly stateno: number
  readonly major: SymbolId
  readonly minor: V
  readonly span: Span
}

/**
 * One popped stack entry handed to the reducer.  `major` is widened to
 * {@link SymbolId} because a popped entry may be either the token we
 * shifted (a {@link TokenId}) or a nonterminal we previously reduced
 * (a {@link SymbolId}).
 */
export interface LalrPopped<V> {
  readonly major: SymbolId
  readonly minor: V
  readonly span: Span
}

/**
 * Called once per reduction.  The engine has already popped the RHS
 * entries off the stack and reversed them into source order before
 * calling you.  `ruleSpan` is the input range covering every popped
 * entry; for an empty production it is a zero-length span at the
 * current input cursor.  Your return value is pushed back as the LHS
 * entry's `minor`.
 */
export type LalrReduce<Ctx, V> = (
  ctx: Ctx,
  ruleId: RuleId,
  popped: LalrPopped<V>[],
  ruleSpan: Span,
) => V

/** A single parse error reported by the engine. */
export interface LalrError<V> {
  /** Parser state number at the time of failure. */
  readonly stateno: number
  /** Terminal that couldn't be parsed in the current state. */
  readonly major: TokenId
  /** Value of that token, as supplied by the caller. */
  readonly minor: V
  /** 0-based index of the failing token within the input iterable. */
  readonly tokenIndex: number
}

/**
 * Lifecycle state of a {@link LalrEngine} session.
 *
 *   running   — accepting further tokens
 *   accepted  — saw YY_ACCEPT_ACTION; `root` is set
 *   errored   — saw YY_ERROR_ACTION / YY_NO_ACTION; further
 *               {@link LalrEngine.next} calls are no-ops (state does
 *               not change)
 *
 * `state` is the primary signal callers check after each
 * {@link LalrEngine.next} call to know whether to keep feeding tokens.
 * C callers look at `pParse->nErr` for the same purpose.
 */
export type LalrSessionPhase = "running" | "accepted" | "errored"

/**
 * Incremental LALR parser session.  One per parse; feed tokens one at
 * a time via `next(major, minor)`.  Analogous to the `struct yyParser`
 * handle passed around by lempar.c's `Parse()` function — except our
 * `state` / `root` / `errors` are session fields because our reducer
 * is a pure callback, whereas C's reducer side-effects into the user's
 * %extra argument (`pParse`).
 */
export interface LalrEngine<Ctx, V> {
  /**
   * Feed one token.  Matches lempar.c's
   * `void Parse(void *yyp, int yymajor, YYMINORTYPE yyminor, ...)`.
   * Returns `void` for the same reason C does: the outcome of one
   * token (shift vs. reduce vs. accept vs. error) is a side-effect
   * on the stack — nothing the caller needs *per call*.  After each
   * call, check `session.state` to know whether the parse is still
   * running; on `accepted` read `session.root`, on `errored` read
   * `session.errors`.
   *
   * When all real tokens have been fed, feed `major === 0` (Lemon's
   * end-of-input `$`) to trigger the final reduce/accept sequence.
   *
   * After a terminal outcome (`accepted` or `error`), further calls
   * are no-ops — stack is not mutated, state does not change.
   */
  next(yymajor: TokenId, yyminor: V, yyminorSpan: Span): void
  /** The current state of the parser. */
  readonly phase: LalrSessionPhase
  /** The final top-of-stack value when accepted. */
  readonly root: V | undefined
  /** Arbitrary state used by the reducer. */
  readonly state: Ctx
  /** Live stack reference for diagnostics / IDE hooks — do not mutate. */
  readonly stack: readonly yyStackEntry<V>[]
  /** Errors accumulated so far.  Today always ≤1.  Live reference — do not mutate. */
  readonly errors: readonly LalrError<V>[]
}

export interface CreateLalrEngine {
  <Ctx, V>(reducer: LalrReduce<Ctx, V>, state: Ctx): LalrEngine<Ctx, V>
}

// ---------------------------------------------------------------------------
// Implementation.
// ---------------------------------------------------------------------------

/**
 * Bind the engine to a specific Lemon grammar defs.  Returns a
 * {@link CreateLalrEngine} factory that allocates fresh
 * {@link LalrEngine} sessions — one per parse.  Constructing the
 * module is cheap (tables are referenced, not copied) so callers can
 * create one per grammar at module load time and feed arbitrarily many
 * strings through it.
 *
 * Implementation note: the session class is defined *inside* this
 * factory so that {@link LalrEngine.next} and `#yy_reduce()` read
 * `K` / `T` as lexically-bound locals rather than property
 * chains off `this`.
 * On hot dispatch paths that's measurably faster (the JIT hoists a
 * bound local out of the loop; it won't always hoist
 * `this.defs.constants.YY_MIN_REDUCE`).  We pay for it with one class
 * object per `engineModuleForGrammar()` call, which is fine because it
 * runs once per grammar at module load.
 */
export function engineModuleForGrammar<Ctx, V>(defs: ParserDefs<Ctx, V>): CreateLalrEngine {
  const K = defs.constants
  const T = defs.tables
  const yyFallback = T.yyFallback ?? []

  // -------------------------------------------------------------------------
  // Table lookups — faithful ports of lempar.c:549 and lempar.c:614.
  // Kept as plain functions (not class methods) so the JIT can inline
  // them into {@link LalrEngine.next}'s hot loop without a `this`-load indirection.
  // -------------------------------------------------------------------------

  /**
   * Given the current state and next terminal token, return the parser
   * action to take.  The action's encoding (shift / shift-reduce /
   * reduce / accept / error) is decoded by {@link LalrEngine.next}'s dispatch loop.
   *
   * lempar.c:549 yy_find_shift_action.
   */
  function yy_find_shift_action(lookahead: TokenId, stateno: number): number {
    // When `stateno` already encodes a pending reduce (> YY_MAX_SHIFT),
    // yy_find_shift_action in C returns it verbatim so the caller can
    // dispatch straight to the reduce branch.
    if (stateno > K.YY_MAX_SHIFT) return stateno

    let la: TokenId = lookahead
    while (true) {
      const base = T.yy_shift_ofst[stateno]
      const i = base + la
      if (T.yy_lookahead[i] !== la) {
        // (1) %fallback — a keyword falling back to its identifier form.
        if (K.YYFALLBACK && la < yyFallback.length) {
          const iFallback = yyFallback[la]
          if (iFallback !== 0) {
            la = iFallback
            continue // retry with the fallback symbol id
          }
        }
        // (2) %wildcard — see lempar.c:586.  The wildcard is consulted
        // only after fallback fails, and only when the lookahead is a
        // real terminal (la > 0).
        if (K.YYWILDCARD > 0) {
          const j = i - la + K.YYWILDCARD
          if (j >= 0 && j < T.yy_lookahead.length && T.yy_lookahead[j] === K.YYWILDCARD && la > 0) {
            return T.yy_action[j]
          }
        }
        // (3) Fall back to the default action for this state.
        return T.yy_default[stateno]
      }
      return T.yy_action[i]
    }
  }

  /**
   * GOTO table lookup after a reduction.  Given the state we're about
   * to return to and the nonterminal we just produced, return the next
   * state (as an action code — see encoding).
   *
   * lempar.c:614 yy_find_reduce_action.  Note: `lookahead` here is the
   * LHS of the just-reduced rule, so it's a {@link SymbolId} (nonterminal),
   * not a {@link TokenId} like in yy_find_shift_action.
   */
  function yy_find_reduce_action(stateno: number, lookahead: SymbolId): number {
    // With no error symbol, lempar.c asserts stateno <= YY_REDUCE_COUNT
    // and the table lookup always succeeds.  We defensively fall back
    // to yy_default on out-of-range input.
    if (stateno > K.YY_REDUCE_COUNT) return T.yy_default[stateno]

    const i = T.yy_reduce_ofst[stateno] + lookahead
    if (i < 0 || i >= K.YY_ACTTAB_COUNT || T.yy_lookahead[i] !== lookahead) {
      return T.yy_default[stateno]
    }
    return T.yy_action[i]
  }

  // -------------------------------------------------------------------------
  // YYParser — the session class.  One per parse.
  //
  // Scoped inside engineModuleForGrammar() so methods read
  // K / T / rules / yyFallback and the yy_find_* helpers from lexical
  // scope.  Callers see this through the exported `LalrEngine<V>`
  // interface above; the class itself is not exported.
  // -------------------------------------------------------------------------
  class YYParser<Ctx, V> implements LalrEngine<Ctx, V> {
    // The LR stack (lempar.c's `yystack` / `yystk0`).  The bottom
    // sentinel's `minor` is synthesised as `undefined as V`; because we
    // never pop it, the caller's reducer never observes the cast.
    readonly #yystack: yyStackEntry<V>[] = [
      {
        stateno: 0,
        major: 0 as SymbolId,
        minor: undefined as V,
        span: { offset: 0, length: 0, line: 1, col: 0 },
      },
    ]
    readonly #errors: LalrError<V>[] = []
    #phase: LalrSessionPhase = "running"
    #root: V | undefined
    #state: Ctx
    #inputIndex = 0
    readonly #reducer: LalrReduce<Ctx, V>

    /**
     * Allocate a fresh incremental parse session.  Matches lempar.c's
     * `void *ParseAlloc(void *(*mallocProc)(size_t), void *pCtx)`
     * (minus the allocator callback — JS GC handles that).
     */
    constructor(onReduce: LalrReduce<Ctx, V>, state: Ctx) {
      this.#reducer = onReduce
      this.#state = state
    }

    get phase(): LalrSessionPhase {
      return this.#phase
    }

    get root(): V | undefined {
      return this.#root
    }

    get stack(): readonly yyStackEntry<V>[] {
      return this.#yystack
    }

    get errors(): readonly LalrError<V>[] {
      return this.#errors
    }

    get state(): Ctx {
      return this.#state
    }

    /**
     * Main dispatch.  lempar.c:915 `Parse()` — the C function's outer
     * while(1) loop has been unrolled: each call to this method
     * consumes exactly one input token, chaining reduces as needed
     * before settling on a shift / accept / error outcome.
     *
     * The caller should check `this.state` after each call.
     */
    next(yymajor: TokenId, yyminor: V, yyminorSpan: Span): void {
      if (this.#phase !== "running") return

      // Hoist the stack field into a local so the hot loop reads a
      // closure slot instead of a hidden-class property on `this`.
      const yystack = this.#yystack

      let act = yystack[yystack.length - 1]!.stateno
      while (true) {
        // Capture the state we're about to query *before* yy_find_shift_action
        // rewrites `act` into an action code.  Needed for error reporting
        // (diagnostics want the state at the point of failure, not the
        // YY_ERROR_ACTION sentinel).  At this point, `act` is always a
        // state number: either the initial yystack[top].stateno, or the
        // post-reduce state we fetched below.
        const stateBeforeLookup = act
        act = yy_find_shift_action(yymajor, act)

        if (act >= K.YY_MIN_REDUCE) {
          // (1) Pure reduce, possibly chained.  Rule = act - YY_MIN_REDUCE.
          this.#yy_reduce((act - K.YY_MIN_REDUCE) as RuleId)
          act = yystack[yystack.length - 1]!.stateno
          continue // retry with the same token against the new state
        }

        if (act <= K.YY_MAX_SHIFTREDUCE) {
          // (2) Shift, or combined shift+reduce.
          //
          // For SHIFTREDUCE actions (YY_MIN_SHIFTREDUCE..YY_MAX_SHIFTREDUCE),
          // lempar.c:709 rewrites the stored state so that the next
          // yy_find_shift_action dispatches straight into the pending reduce.
          let newState = act
          if (newState > K.YY_MAX_SHIFT) {
            newState += K.YY_MIN_REDUCE - K.YY_MIN_SHIFTREDUCE
          }
          yystack.push({
            stateno: newState,
            major: yymajor,
            minor: yyminor,
            span: yyminorSpan,
          })
          this.#inputIndex++
          return
        }

        if (act === K.YY_ACCEPT_ACTION) {
          // (3) Accept.  Per lempar.c:965, yytos-- then yy_accept.  We
          // capture the top value first (that's the CST root or
          // semantic value the reducer built).
          this.#root = yystack[yystack.length - 1]!.minor
          this.#phase = "accepted"
          return
        }

        // (4) Anything else is YY_ERROR_ACTION or YY_NO_ACTION.  We
        // allocate one LalrError per terminal-error transition — this
        // only happens once per parse in the current no-recovery model,
        // so the allocation isn't on a hot path.
        this.#errors.push({
          stateno: stateBeforeLookup,
          major: yymajor,
          minor: yyminor,
          tokenIndex: this.#inputIndex,
        })
        this.#phase = "errored"
        return
      }
    }

    /**
     * Reduce: pop `nrhs` entries, call `onReduce`, run GOTO, push the
     * result.  Mirrors the non-action-switch half of lempar.c:742
     * `yy_reduce`.  In C the action switch is inlined here from the
     * generated rule bodies in parse.y; our reducer is the caller's
     * pure `onReduce` callback, which returns the new stack value.
     */
    #yy_reduce(yyruleno: RuleId): void {
      // lempar.c:772 reads `yyRuleInfoLhs[yyruleno]` and
      // `yyRuleInfoNRhs[yyruleno]` (the latter negative) off the flat
      // rule-info tables.  Our tables carry the same data with NRhs
      // stored as a positive count.
      const nrhs = T.yyRuleInfoNRhs[yyruleno]!
      const lhs = T.yyRuleInfoLhs[yyruleno]!
      const yystack = this.#yystack

      // Pop nrhs entries into `popped`, in source order.  We pop
      // last-first and reverse so that popped[i] corresponds to the
      // rule's i-th RHS position.
      const popped: LalrPopped<V>[] = []
      for (let i = 0; i < nrhs; i++) {
        const e = yystack.pop()!
        popped.push({ major: e.major, minor: e.minor, span: e.span })
      }
      popped.reverse()

      // Rule span: union of the popped entries' spans, or a zero-length
      // span at the end of the last consumed token for empty productions.
      let ruleSpan: Span
      if (popped.length === 0) {
        const top = yystack[yystack.length - 1]!.span
        ruleSpan = {
          offset: top.offset + top.length,
          length: 0,
          line: top.line,
          col: top.col,
        }
      } else {
        const first = popped[0]!.span
        const last = popped[popped.length - 1]!.span
        ruleSpan = {
          offset: first.offset,
          length: last.offset + last.length - first.offset,
          line: first.line,
          col: first.col,
        }
      }

      const minor = this.#reducer(this.#state, yyruleno, popped, ruleSpan)

      // GOTO — see lempar.c:774 yyact = yy_find_reduce_action(...).
      const baseState = yystack[yystack.length - 1]!.stateno
      const act = yy_find_reduce_action(baseState, lhs)
      yystack.push({ stateno: act, major: lhs, minor, span: ruleSpan })
    }
  }

  /**
   * In the C parser, each reduce step may perform side-effects.
   * SQLite's parser doesn't build an AST, instead its parser directly updates
   * various state in the system.
   *
   * Since we are just a parser and not an interpreter, it doesn't make sense to
   * port the side-effect actions.
   *
   * Instead, the caller provides a `reducer` function that can be used to build
   * a tree, do side effects, whatever.
   */
  function ParseAlloc<Ctx, V>(reducer: LalrReduce<Ctx, V>, state: Ctx): LalrEngine<Ctx, V> {
    return new YYParser(reducer, state)
  }

  return ParseAlloc
}
