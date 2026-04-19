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
// The dispatch path is intentionally simple:
//   * `handlers.ts` exports one flat `Record<StableKey, Handler>`.
//   * `createAstBuilder(defs)` closes over the parser defs.
//   * `build(cst, sql)` computes the current node's stable key and looks
//     up the handler directly.
//
// Missing handlers fall back to {@link UnknownAstNode}, so the AST layer can be
// built out incrementally without inventing a large registration framework
// up front.

import type { ParserRule, ParserDefs, RuleId, SymbolId } from "../lempar.ts"
import type { CstNode, RuleNode } from "../parser.ts"
import { handlers as defaultHandlers } from "./handlers.ts"
import type { AstError, AstNode, UnknownAstNode } from "./types.ts"

/** A grammar-shape key, stable across SQLite version bumps. */
export type StableKey = string

/**
 * Resolves a symbol id to its display name.  The prod defs strips the
 * redundant `name` field from every RHS position (they're recoverable
 * from the top-level `symbols[]` table), so stable-key construction
 * goes through this lookup rather than reading names inline.
 */
export type SymbolName = (id: SymbolId) => string

/**
 * Build a {@link SymbolName} lookup from the parser defs' `symbols[]` table.
 * The symbol id IS the array index — prod defs don't ship a redundant
 * `id` field.
 */
export function buildSymbolName(defs: Pick<ParserDefs, "symbols">): SymbolName {
  const byId: string[] = []
  for (let i = 0; i < defs.symbols.length; i++) {
    byId[i] = defs.symbols[i]!.name
  }
  return (id) => byId[id] ?? `?${id}`
}

/**
 * Compute the stable key for a single rule.  Multi-terminals are joined
 * with `|`, positions within an RHS with spaces.  `symbolName` should
 * come from `buildSymbolName(defs)` and be reused across all rules for
 * one set of defs.
 */
export function stableKeyForRule(rule: ParserRule, symbolName: SymbolName): StableKey {
  const rhsParts: string[] = []
  for (const p of rule.rhs) {
    if (p.symbol !== undefined) {
      rhsParts.push(symbolName(p.symbol))
    } else if (p.multi !== undefined) {
      rhsParts.push(p.multi.map((m) => symbolName(m.symbol)).join("|"))
    } else {
      rhsParts.push("?")
    }
  }
  return `${rule.lhsName}::${rhsParts.join(" ")}`
}

/**
 * Context threaded through every handler call.  Handlers that need to
 * recursively convert child CST nodes should do so via `ctx.dispatch`.
 */
export interface AstContext {
  readonly sql: string
  readonly errors: AstError[]
  /** Recurse into a child CST node.  Returns `undefined` for terminals. */
  readonly dispatch: (cst: CstNode) => AstNode | undefined
}

/**
 * A handler turns one {@link RuleNode} into one AST node.  The type parameter
 * narrows the return type when the registry wants stronger guarantees
 * per rule (future work — today everything returns {@link AstNode}).
 */
export type Handler<T extends AstNode = AstNode> = (cst: RuleNode, ctx: AstContext) => T

/** A table of handlers keyed by stable key. */
export type HandlerMap = Readonly<Record<StableKey, Handler>>

export interface VerifyHandlersResult {
  /** Every stable key in the defs, in rule-id order. */
  readonly allRuleKeys: readonly StableKey[]
  /** Stable keys that collide across multiple rules.  Should stay empty. */
  readonly duplicateRuleKeys: readonly StableKey[]
  /** Handler keys that don't exist in the current defs. */
  readonly unknownHandlerKeys: readonly StableKey[]
}

/**
 * Verify that a handler table lines up with a concrete grammar:
 *   * every stable key in the defs is unique
 *   * every handler key points at a real rule in the defs
 *
 * We do this in tests rather than by generating TypeScript exhaustiveness
 * machinery for every rule.
 */
export function verifyHandlers(
  defs: Pick<ParserDefs, "rules" | "symbols">,
  handlers: HandlerMap,
): VerifyHandlersResult {
  const symbolName = buildSymbolName(defs)
  const seen = new Map<StableKey, number>()
  const allRuleKeys: StableKey[] = []
  const duplicateRuleKeys: StableKey[] = []

  for (const rule of defs.rules) {
    const key = stableKeyForRule(rule, symbolName)
    allRuleKeys.push(key)
    const count = seen.get(key) ?? 0
    if (count === 1) duplicateRuleKeys.push(key)
    seen.set(key, count + 1)
  }

  const knownKeys = new Set(allRuleKeys)
  const unknownHandlerKeys = Object.keys(handlers).filter((key) => !knownKeys.has(key))

  return {
    allRuleKeys,
    duplicateRuleKeys: duplicateRuleKeys.sort(),
    unknownHandlerKeys: unknownHandlerKeys.sort(),
  }
}

export interface ConvertOptions {
  /**
   * If true, throw when a rule falls back to {@link UnknownAstNode} or when a
   * handler itself throws.  Default false — the AST layer is expected to
   * grow incrementally.
   */
  readonly strict?: boolean
  /**
   * If provided, called with each stable key that gets dispatched.
   * Used by `scripts/ast-coverage.ts` to build a hit set from the test
   * suite.
   */
  readonly onHit?: (key: StableKey) => void
}

function unknownAst(cst: RuleNode, stableKey: StableKey): UnknownAstNode {
  return {
    kind: "Unknown",
    cst,
    stableKey,
  }
}

/**
 * Convert a CST into an AST using a stable-key handler table.
 */
export function cstToAst(
  cst: CstNode,
  defs: Pick<ParserDefs, "rules" | "symbols">,
  handlers: HandlerMap,
  sql: string,
  opts: ConvertOptions = {},
): { ast?: AstNode; errors: AstError[] } {
  const rules = defs.rules
  const symbolName = buildSymbolName(defs)
  const errors: AstError[] = []

  const dispatch = (node: CstNode): AstNode | undefined => {
    if (node.kind === "token") return undefined

    const rule = rules[node.rule as RuleId]
    if (!rule) {
      const message = `Unknown rule id ${node.rule}`
      if (opts.strict) throw new Error(message)
      errors.push({ message, cst: node })
      return unknownAst(node, `?${node.rule}`)
    }

    const stableKey = stableKeyForRule(rule, symbolName)
    opts.onHit?.(stableKey)

    const handler = handlers[stableKey]
    if (!handler) {
      if (opts.strict) throw new Error(`No AST handler for ${stableKey}`)
      return unknownAst(node, stableKey)
    }

    try {
      return handler(node, { sql, errors, dispatch })
    } catch (cause) {
      if (opts.strict) throw cause
      errors.push({
        message: cause instanceof Error ? cause.message : String(cause),
        cst: node,
      })
      return unknownAst(node, stableKey)
    }
  }

  return {
    ast: dispatch(cst),
    errors,
  }
}

/**
 * Convenience factory that closes over one set of parser defs and a
 * stable-key handler table.
 */
export function createAstBuilder(
  defs: ParserDefs,
  handlers: HandlerMap = defaultHandlers,
  opts: ConvertOptions = {},
) {
  const verification = verifyHandlers(defs, handlers)
  return {
    verify() {
      return verification
    },
    build(cst: CstNode, sql: string) {
      return cstToAst(cst, defs, handlers, sql, opts)
    },
  }
}
