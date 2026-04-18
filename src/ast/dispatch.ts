// Runtime dispatch from CST → AST.
//
// SQLite rule ids are not stable across versions — a rule that's id=42
// in 3.54.0 can be id=43 in 3.55.0.  We avoid that instability by keying
// handlers on a version-stable shape string derived from the rule's
// grammar form:
//
//   stableKey(r) = `${r.lhsName}::${rhs symbol names joined}`
//
// e.g. `"expr::LP expr RP"`, `"cmd::BEGIN transtype trans_opt"`.
//
// At parser-creation time, `bindRegistry` walks `dump.rules` once,
// resolves each rule's stable key against the handler registry, and
// builds a rule-id indexed array for O(1) dispatch.  Rules that have no
// registered handler are surfaced as `missingKeys` so tests / boot-time
// checks can fail loudly.
//
// Handler bodies live in the per-category files (./stmt.ts, ./expr.ts,
// etc.) and are aggregated by ./registry.ts.  This file defines the
// types and wiring only — no SQL semantics live here.

import type { DumpRule, LemonDump, RuleId, SymbolId } from '../lempar.ts';
import type { CstNode, RuleNode } from '../parser.ts';
import type { AstError, AstNode } from './types.ts';

/** A grammar-shape key, stable across SQLite version bumps. */
export type StableKey = string;

/**
 * Resolves a symbol id to its display name.  The prod dump strips the
 * redundant `name` field from every RHS position (they're recoverable
 * from the top-level `symbols[]` table), so stable-key construction
 * goes through this lookup rather than reading names inline.
 */
export type SymbolName = (id: SymbolId) => string;

/** Build a `SymbolName` lookup from a dump's `symbols[]` table. */
export function buildSymbolName(dump: Pick<LemonDump, 'symbols'>): SymbolName {
  const byId: string[] = [];
  for (const s of dump.symbols) byId[s.id] = s.name;
  return (id) => byId[id] ?? `?${id}`;
}

/**
 * Compute the stable key for a single rule.  Multi-terminals are joined
 * with `|`, positions within an RHS with spaces.  `symbolName` should
 * come from `buildSymbolName(dump)` and be reused across all rules for
 * one dump.
 */
export function stableKeyForRule(rule: DumpRule, symbolName: SymbolName): StableKey {
  const rhsParts: string[] = [];
  for (const p of rule.rhs) {
    if (p.symbol !== undefined) {
      rhsParts.push(symbolName(p.symbol));
    } else if (p.multi !== undefined) {
      rhsParts.push(p.multi.map((m) => symbolName(m.symbol)).join('|'));
    } else {
      rhsParts.push('?');
    }
  }
  return `${rule.lhsName}::${rhsParts.join(' ')}`;
}

/**
 * Context threaded through every handler call.  Handlers that need to
 * recursively convert child CST nodes should do so via `ctx.dispatch`.
 */
export interface AstContext {
  readonly sql: string;
  readonly errors: AstError[];
  /** Recurse into a child CST node.  Returns `undefined` for terminals. */
  readonly dispatch: (cst: CstNode) => AstNode | undefined;
}

/**
 * A handler turns one `RuleNode` into one AST node.  The type parameter
 * narrows the return type when the registry wants stronger guarantees
 * per rule (future work — today everything returns `AstNode`).
 */
export type Handler<T extends AstNode = AstNode> = (
  cst: RuleNode,
  ctx: AstContext,
) => T;

/** A table of handlers keyed by stable key. */
export type HandlerRegistry = Readonly<Record<StableKey, Handler>>;

/**
 * The per-dump binding: a fast rule-id → handler lookup plus a
 * coverage summary.  Produced once by `bindRegistry`, reused for every
 * parse call against that dump.
 */
export interface BoundDispatcher {
  /** Look up the handler for a rule id.  `undefined` if no handler registered. */
  readonly handlerFor: (ruleId: RuleId) => Handler | undefined;
  /** Stable keys of rules that have actions but no registered handler. */
  readonly missingKeys: readonly StableKey[];
  /** Every stable key in the dump, in rule-id order.  Useful for coverage. */
  readonly allKeys: readonly StableKey[];
}

/**
 * Resolve each rule's stable key against the registry and build a
 * rule-id-indexed handler array.  Called once per parser instance.
 *
 * TODO — implement.  See AST_DESIGN_IDEAS.md for the algorithm.
 */
export function bindRegistry(
  _dump: LemonDump,
  _registry: HandlerRegistry,
): BoundDispatcher {
  throw new Error('bindRegistry: not yet implemented');
}

export interface ConvertOptions {
  /**
   * If true, throw when a handler is missing for a rule that has actions
   * in the grammar.  Otherwise fall back to `UnknownAstNode`.  Default
   * false — tests should opt in.
   */
  readonly strict?: boolean;
  /**
   * If provided, called with each stable key that gets dispatched.
   * Used by `scripts/ast-coverage.ts` to build a hit set from the test
   * suite.
   */
  readonly onHit?: (key: StableKey) => void;
}

/**
 * Convert a CST into an AST using the given bound dispatcher.
 *
 * TODO — implement.  Expected shape:
 *   - Walk `cst`.  For rule nodes, look up the handler and invoke it
 *     with an `AstContext` whose `dispatch` recurses back into this
 *     function.
 *   - For token nodes, return `undefined` (terminals aren't AST nodes
 *     in their own right; handlers read them directly off the CST).
 *   - Accumulate handler-raised errors in the returned `errors` array.
 */
export function cstToAst(
  _cst: CstNode,
  _dispatcher: BoundDispatcher,
  _sql: string,
  _opts: ConvertOptions = {},
): { ast?: AstNode; errors: AstError[] } {
  throw new Error('cstToAst: not yet implemented');
}

/**
 * Convenience factory that packages a `bindRegistry` call with a
 * `cstToAst`-using `build(cst, sql)` method.  Per-version modules call
 * this once to produce the user-facing `parseToAst`.
 *
 * TODO — implement (trivial once `bindRegistry` and `cstToAst` land).
 */
export function createAstBuilder(
  dump: LemonDump,
  registry: HandlerRegistry,
  opts: ConvertOptions = {},
) {
  const dispatcher = bindRegistry(dump, registry);
  return {
    dispatcher,
    build(cst: CstNode, sql: string) {
      return cstToAst(cst, dispatcher, sql, opts);
    },
  };
}
