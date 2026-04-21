// Readable s-expression rendering of an AST, composed over `traverse`.
//
// Each node becomes `(<Kind> :scalar v :scalar v <child> <child> ...)`,
// one node per line, indented by depth.  Scalar fields (strings,
// numbers, booleans, `Uint8Array` for blobs) inline on the opening
// line; child AST nodes appear positionally in `VisitorKeys` order.
// `undefined` optional children are elided — cross-reference
// `VisitorKeys` to recover which slot a child occupies when an
// earlier optional slot is absent.

import type { AstNode } from "./nodes.ts"
import { traverse, VisitorKeys } from "./traverse.ts"

export interface PrintOptions {
  /** One level of indentation.  Default `"  "` (two spaces). */
  readonly indent?: string
}

const META_KEYS = new Set<string>(["kind", "span"])

function formatScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Uint8Array) {
    let hex = ""
    for (const b of value) hex += b.toString(16).padStart(2, "0")
    return `#x"${hex}"`
  }
  return JSON.stringify(value)
}

/** Render an AST node as a pretty-printed s-expression string. */
export function toSexpr(root: AstNode, opts: PrintOptions = {}): string {
  const tab = opts.indent ?? "  "
  const parts: string[] = []
  let depth = 0

  traverse(root, {
    enter(node) {
      if (parts.length > 0) parts.push("\n", tab.repeat(depth))
      parts.push("(", node.kind)

      const keysForKind = VisitorKeys[node.kind as keyof typeof VisitorKeys] as
        | readonly string[]
        | undefined
      const childKeys = keysForKind ? new Set<string>(keysForKind) : undefined

      for (const k of Object.keys(node)) {
        if (META_KEYS.has(k)) continue
        if (childKeys?.has(k)) continue
        const v = (node as unknown as Record<string, unknown>)[k]
        if (v === undefined) continue
        parts.push(" :", k, " ", formatScalar(v))
      }

      depth++
    },
    leave() {
      depth--
      parts.push(")")
    },
  })

  return parts.join("")
}
