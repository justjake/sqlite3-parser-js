import { CstNode, TokenNode } from "./parser";

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
