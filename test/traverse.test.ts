// Unit tests for the AST traversal API in `src/ast/traverse.ts`.
// Covers the enter/leave visitor pair, per-type `nodes` dispatch, the
// "skip" / "break" control signals, and the `keys` override that
// replaces `VisitorKeys[type]` for a specific parse.

import { describe, expect, test } from "bun:test"

import { parse } from "../generated/current.ts"
import { traverse, VisitorKeys, type Visitor } from "../src/ast/traverse.ts"
import type { AstNode } from "../src/ast/nodes.ts"

function ast(sql: string): AstNode {
  const r = parse(sql)
  if (r.status !== "ok") {
    throw new Error(
      `expected parse success for ${JSON.stringify(sql)}, got: ` +
        r.errors.map((e) => e.message).join("; "),
    )
  }
  return r.root
}

/** Record an `enter:Type` / `leave:Type` trace — useful for order assertions. */
function trace(root: AstNode, extra: Omit<Visitor, "enter" | "leave"> = {}): string[] {
  const events: string[] = []
  traverse(root, {
    ...extra,
    enter(node) {
      events.push(`enter:${node.type}`)
    },
    leave(node) {
      events.push(`leave:${node.type}`)
    },
  })
  return events
}

describe("traverse — enter/leave ordering", () => {
  test("visits every node depth-first and pairs enter with leave", () => {
    const events = trace(ast("SELECT a FROM t"))
    expect(events).toEqual([
      "enter:CmdList",
      "enter:SelectStmt",
      "enter:Select",
      "enter:SelectFrom",
      "enter:ExprResultColumn",
      "enter:Id",
      "leave:Id",
      "leave:ExprResultColumn",
      "enter:FromClause",
      "enter:TableSelectTable",
      "enter:QualifiedName",
      "enter:Name",
      "leave:Name",
      "leave:QualifiedName",
      "leave:TableSelectTable",
      "leave:FromClause",
      "leave:SelectFrom",
      "leave:Select",
      "leave:SelectStmt",
      "leave:CmdList",
    ])
  })

  test("every enter has a matching leave with balanced depth", () => {
    // Fuzz-style structural invariant: the stack of open enter frames
    // returns to zero exactly once (at the end of the root).
    let depth = 0
    let maxDepth = 0
    traverse(ast("SELECT a + 1, b FROM t WHERE c = 2"), {
      enter() {
        depth++
        maxDepth = Math.max(maxDepth, depth)
      },
      leave() {
        depth--
        expect(depth).toBeGreaterThanOrEqual(0)
      },
    })
    expect(depth).toBe(0)
    expect(maxDepth).toBeGreaterThan(3)
  })

  test("parent argument is the nearest enclosing AST node", () => {
    // Hit a node that lives inside an array-of-nodes slot — the parent
    // should be the owning AST node, not the array wrapper.
    const pairs: Array<{ child: string; parent: string | undefined }> = []
    traverse(ast("SELECT a, b FROM t"), {
      enter(node, parent) {
        pairs.push({ child: node.type, parent: parent?.type })
      },
    })
    expect(pairs[0]).toEqual({ child: "CmdList", parent: undefined })
    // Both result columns should see `SelectFrom` as their parent.
    const resultColumnParents = pairs
      .filter((p) => p.child === "ExprResultColumn")
      .map((p) => p.parent)
    expect(resultColumnParents).toEqual(["SelectFrom", "SelectFrom"])
  })
})

describe('traverse — enter returning "skip"', () => {
  test("prunes children but still fires leave on the pruned node", () => {
    const events: string[] = []
    traverse(ast("SELECT a FROM t"), {
      enter(node) {
        events.push(`enter:${node.type}`)
        if (node.type === "SelectFrom") return "skip"
      },
      leave(node) {
        events.push(`leave:${node.type}`)
      },
    })
    // After entering SelectFrom we skip: no ExprResultColumn / FromClause
    // descendants appear, but the matching leave:SelectFrom still fires.
    expect(events).toContain("enter:SelectFrom")
    expect(events).toContain("leave:SelectFrom")
    expect(events).not.toContain("enter:ExprResultColumn")
    expect(events).not.toContain("enter:FromClause")
  })

  test("skip in per-type `nodes` handler also prunes children", () => {
    const events: string[] = []
    traverse(ast("SELECT a FROM t"), {
      enter(node) {
        events.push(`enter:${node.type}`)
      },
      leave(node) {
        events.push(`leave:${node.type}`)
      },
      nodes: {
        SelectFrom() {
          return "skip"
        },
      },
    })
    expect(events).toContain("enter:SelectFrom")
    expect(events).toContain("leave:SelectFrom")
    expect(events).not.toContain("enter:ExprResultColumn")
  })
})

describe('traverse — enter returning "break"', () => {
  test("halts the walk entirely: no further enter/leave events fire", () => {
    const events: string[] = []
    traverse(ast("SELECT a FROM t"), {
      enter(node) {
        events.push(`enter:${node.type}`)
        if (node.type === "ExprResultColumn") return "break"
      },
      leave(node) {
        events.push(`leave:${node.type}`)
      },
    })
    // Walk reaches ExprResultColumn's enter then stops.  No siblings
    // (FromClause) are visited, and no trailing leave events fire.
    expect(events).toEqual([
      "enter:CmdList",
      "enter:SelectStmt",
      "enter:Select",
      "enter:SelectFrom",
      "enter:ExprResultColumn",
    ])
  })

  test("break from a leave callback unwinds cleanly", () => {
    const events: string[] = []
    traverse(ast("SELECT 1, 2"), {
      enter(node) {
        events.push(`enter:${node.type}`)
      },
      leave(node) {
        events.push(`leave:${node.type}`)
        if (node.type === "NumericLiteral") return "break"
      },
    })
    // First NumericLiteral's leave triggers break — the second literal
    // (sibling in the ExprResultColumn list) is never visited.
    expect(events.filter((e) => e === "enter:NumericLiteral")).toHaveLength(1)
    expect(events.filter((e) => e === "leave:NumericLiteral")).toHaveLength(1)
  })
})

describe("traverse — nodes (per-type handlers)", () => {
  test("fires only for matching types and after the generic enter", () => {
    const events: string[] = []
    traverse(ast("SELECT a FROM t"), {
      enter(node) {
        events.push(`enter:${node.type}`)
      },
      nodes: {
        Id(node) {
          events.push(`id-handler:${node.name}`)
        },
        Name(node) {
          events.push(`name-handler:${node.text}`)
        },
      },
    })
    // Generic enter fires before the per-type handler on the same node.
    const idEnter = events.indexOf("enter:Id")
    const idHandler = events.indexOf("id-handler:a")
    expect(idEnter).toBeGreaterThanOrEqual(0)
    expect(idHandler).toBe(idEnter + 1)
    expect(events).toContain("name-handler:t")
  })

  test("per-type handler receives the typed node payload", () => {
    // The `nodes` map is typed per-kind; the handler sees the concrete
    // node shape, so field access works without casts.  We assert a
    // field unique to `Id` to prove the dispatch actually picked the
    // right record.
    let captured: string | undefined
    traverse(ast("SELECT foo"), {
      nodes: {
        Id(node) {
          captured = node.name
        },
      },
    })
    expect(captured).toBe("foo")
  })
})

describe("traverse — VisitorKeys and keys overrides", () => {
  test("exported VisitorKeys covers the shapes smoke.test exercises", () => {
    // Spot-check a handful of critical entries to guard against
    // accidental deletions.  Order is load-bearing — it defines the
    // visit sequence — so we assert exact arrays.
    expect(VisitorKeys.CmdList).toEqual(["cmds"])
    expect(VisitorKeys.SelectStmt).toEqual(["body"])
    expect(VisitorKeys.BinaryExpr).toEqual(["left", "right"])
    expect(VisitorKeys.Select).toEqual(["with", "select", "compounds", "orderBy", "limit"])
  })

  test("keys override replaces the default traversal for that type", () => {
    // `BinaryExpr` defaults to ["left", "right"].  Flip to ["right"]
    // and the traversal should ignore the left operand entirely.
    const events: string[] = []
    traverse(ast("SELECT a + 1"), {
      enter(node) {
        events.push(node.type)
      },
      keys: { BinaryExpr: ["right"] },
    })
    expect(events).toContain("BinaryExpr")
    expect(events).toContain("NumericLiteral")
    expect(events).not.toContain("Id")
  })

  test("empty keys override prunes all children of a type", () => {
    // Replace SelectFrom's keys with an empty array — children are
    // unreachable and no downstream Expr/FromClause events fire.
    const events: string[] = []
    traverse(ast("SELECT a FROM t WHERE b = 2"), {
      enter(node) {
        events.push(node.type)
      },
      keys: { SelectFrom: [] },
    })
    expect(events).toContain("SelectFrom")
    expect(events).not.toContain("ExprResultColumn")
    expect(events).not.toContain("FromClause")
    expect(events).not.toContain("BinaryExpr")
  })
})
