// Snapshot-style tests for the AST s-expression printer.  These exercise
// the happy path (one representative SQL per structural shape) and a
// handful of edge cases around the scalar / child-key / undefined-slot
// handling in `toSexpr`.  If you flatten or rename an AST node, the
// expected strings here are the easiest place to spot the shape change.

import { describe, expect, test } from "bun:test"

import { parse } from "../generated/current.ts"
import { toSexpr } from "../src/ast/traverse.ts"
import type { AstNode } from "../src/ast/nodes.ts"

/** Parse `sql`, fail the test if the parser didn't accept, return the AST. */
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

describe("toSexpr — shapes", () => {
  test("SELECT with expression and WHERE", () => {
    expect(toSexpr(ast("SELECT a + 1 FROM t WHERE b = 2"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (SelectFrom
        (ExprResultColumn
          (BinaryExpr :op "Add"
            (Id :name "a")
            (NumericLiteral :value "1")))
        (FromClause
          (TableSelectTable
            (QualifiedName
              (Name :text "t"))))
        (BinaryExpr :op "Equals"
          (Id :name "b")
          (NumericLiteral :value "2"))))))`,
    )
  })

  test("EXPLAIN marker flag and its nested Select", () => {
    expect(toSexpr(ast("EXPLAIN SELECT 1"))).toBe(
      `(CmdList
  (ExplainStmt :queryPlan false
    (SelectStmt
      (Select
        (SelectFrom
          (ExprResultColumn
            (NumericLiteral :value "1")))))))`,
    )
  })

  test("EXPLAIN QUERY PLAN sets queryPlan=true", () => {
    expect(toSexpr(ast("EXPLAIN QUERY PLAN SELECT 1"))).toBe(
      `(CmdList
  (ExplainStmt :queryPlan true
    (SelectStmt
      (Select
        (SelectFrom
          (ExprResultColumn
            (NumericLiteral :value "1")))))))`,
    )
  })

  test("compound SELECT puts ORDER BY/LIMIT on the outer Select", () => {
    expect(toSexpr(ast("SELECT a FROM t UNION SELECT b FROM u ORDER BY 1 LIMIT 10"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (SelectFrom
        (ExprResultColumn
          (Id :name "a"))
        (FromClause
          (TableSelectTable
            (QualifiedName
              (Name :text "t")))))
      (CompoundSelect :operator "Union"
        (SelectFrom
          (ExprResultColumn
            (Id :name "b"))
          (FromClause
            (TableSelectTable
              (QualifiedName
                (Name :text "u"))))))
      (SortedColumn
        (NumericLiteral :value "1"))
      (Limit
        (NumericLiteral :value "10")))))`,
    )
  })

  test("WITH clause nested under Select", () => {
    expect(toSexpr(ast("WITH cte AS (SELECT 1) SELECT * FROM cte"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (With :recursive false
        (CommonTableExpr :materialized "Any"
          (Name :text "cte")
          (Select
            (SelectFrom
              (ExprResultColumn
                (NumericLiteral :value "1"))))))
      (SelectFrom
        (StarResultColumn)
        (FromClause
          (TableSelectTable
            (QualifiedName
              (Name :text "cte"))))))))`,
    )
  })

  test("VALUES row set", () => {
    expect(toSexpr(ast("VALUES (1, 2), (3, 4)"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (SelectValues
        (ValuesRow
          (NumericLiteral :value "1")
          (NumericLiteral :value "2"))
        (ValuesRow
          (NumericLiteral :value "3")
          (NumericLiteral :value "4"))))))`,
    )
  })

  test("three-part qualified identifier inlines three Names", () => {
    expect(toSexpr(ast("SELECT main.tbl.col FROM main.tbl"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (SelectFrom
        (ExprResultColumn
          (QualifiedExpr
            (Name :text "main")
            (Name :text "tbl")
            (Name :text "col")))
        (FromClause
          (TableSelectTable
            (QualifiedName
              (Name :text "main")
              (Name :text "tbl"))))))))`,
    )
  })

  test("each Literal variant appears directly as an Expr", () => {
    expect(toSexpr(ast("SELECT 42, 'hello', NULL, CURRENT_DATE FROM t"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (SelectFrom
        (ExprResultColumn
          (NumericLiteral :value "42"))
        (ExprResultColumn
          (StringLiteral :value "hello"))
        (ExprResultColumn
          (NullLiteral))
        (ExprResultColumn
          (CurrentDateLiteral))
        (FromClause
          (TableSelectTable
            (QualifiedName
              (Name :text "t"))))))))`,
    )
  })

  test("multi-statement script yields a CmdList with two stmts", () => {
    expect(toSexpr(ast("DROP TABLE t; DROP INDEX idx"))).toBe(
      `(CmdList
  (DropTableStmt :ifExists false
    (QualifiedName
      (Name :text "t")))
  (DropIndexStmt :ifExists false
    (QualifiedName
      (Name :text "idx"))))`,
    )
  })

  test('BLOB literal renders as hex #x"..."', () => {
    expect(toSexpr(ast("SELECT x'FF00'"))).toBe(
      `(CmdList
  (SelectStmt
    (Select
      (SelectFrom
        (ExprResultColumn
          (BlobLiteral :bytes #x"ff00"))))))`,
    )
  })
})

describe("toSexpr — options", () => {
  test("custom indent", () => {
    const root = ast("SELECT 1")
    // Use \t for visual distinction.
    expect(toSexpr(root, { indent: "\t" })).toBe(
      `(CmdList
\t(SelectStmt
\t\t(Select
\t\t\t(SelectFrom
\t\t\t\t(ExprResultColumn
\t\t\t\t\t(NumericLiteral :value "1"))))))`,
    )
  })

  test("zero-width indent drops indent padding but keeps per-node newlines", () => {
    expect(toSexpr(ast("SELECT 1"), { indent: "" })).toBe(
      `(CmdList
(SelectStmt
(Select
(SelectFrom
(ExprResultColumn
(NumericLiteral :value "1"))))))`,
    )
  })
})
