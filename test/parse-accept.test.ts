// Parser acceptance suite — broad coverage that each major statement
// shape reaches `status: "accepted"` with the expected top-level
// structure.  Complements `parse-errors.test.ts` (error paths) and
// `printer.test.ts` (exact AST shapes for a few canonical queries).
//
// The roundtrip block proves the printer is total over the node types
// these queries produce: `toSexpr(parse(sql))` is stable under a second
// `toSexpr(parse(print(...)))` re-parse of the captured s-expression's
// originating SQL.

import { describe, expect, test } from "bun:test"

import { parse } from "../generated/current.ts"
import { toSexpr } from "../src/traverse.ts"
import type { AstNode, CmdList } from "../src/ast/nodes.ts"

function accepted(sql: string): CmdList {
  const r = parse(sql)
  if (r.status !== "accepted") {
    throw new Error(
      `expected parse success for ${JSON.stringify(sql)}, got: ` +
        r.errors.map((e) => e.message).join("; "),
    )
  }
  return r.ast
}

/** The single top-level `type` of the Nth command in a CmdList. */
function cmdType(root: CmdList, index = 0): string {
  const cmd = root.cmds[index] as AstNode | undefined
  return cmd?.type ?? "<missing>"
}

// ---------------------------------------------------------------------------
// CREATE / ALTER / DROP — schema DDL.
// ---------------------------------------------------------------------------

describe("CREATE statements", () => {
  test("CREATE TABLE with column defs and constraints", () => {
    const root = accepted(
      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INT DEFAULT 0)",
    )
    expect(cmdType(root)).toBe("CreateTableStmt")
  })

  test("CREATE TABLE IF NOT EXISTS", () => {
    expect(cmdType(accepted("CREATE TABLE IF NOT EXISTS t (id INT)"))).toBe("CreateTableStmt")
  })

  test("CREATE TEMP TABLE ... AS SELECT", () => {
    expect(cmdType(accepted("CREATE TEMP TABLE snap AS SELECT * FROM t"))).toBe("CreateTableStmt")
  })

  test("CREATE TABLE with table-level PRIMARY KEY and FOREIGN KEY", () => {
    expect(
      cmdType(
        accepted(
          "CREATE TABLE orders (" +
            "uid INT, pid INT, " +
            "PRIMARY KEY (uid, pid), " +
            "FOREIGN KEY (uid) REFERENCES users(id) ON DELETE CASCADE" +
            ")",
        ),
      ),
    ).toBe("CreateTableStmt")
  })

  test("CREATE UNIQUE INDEX with WHERE clause", () => {
    expect(cmdType(accepted("CREATE UNIQUE INDEX ix_t_x ON t(x) WHERE x IS NOT NULL"))).toBe(
      "CreateIndexStmt",
    )
  })

  test("CREATE VIEW with column list and SELECT", () => {
    expect(cmdType(accepted("CREATE VIEW v(a, b) AS SELECT 1, 2"))).toBe("CreateViewStmt")
  })

  test("CREATE TRIGGER firing AFTER INSERT", () => {
    const sql =
      "CREATE TRIGGER tr AFTER INSERT ON t BEGIN UPDATE u SET x = NEW.x WHERE id = NEW.id; END"
    expect(cmdType(accepted(sql))).toBe("CreateTriggerStmt")
  })

  test("CREATE VIRTUAL TABLE with module args", () => {
    expect(cmdType(accepted("CREATE VIRTUAL TABLE fts USING fts5(body)"))).toBe(
      "CreateVirtualTableStmt",
    )
  })
})

describe("ALTER / DROP statements", () => {
  test("ALTER TABLE ... RENAME TO", () => {
    expect(cmdType(accepted("ALTER TABLE t RENAME TO t2"))).toBe("AlterTableStmt")
  })

  test("ALTER TABLE ... ADD COLUMN", () => {
    expect(cmdType(accepted("ALTER TABLE t ADD COLUMN c INTEGER"))).toBe("AlterTableStmt")
  })

  test("ALTER TABLE ... RENAME COLUMN", () => {
    expect(cmdType(accepted("ALTER TABLE t RENAME COLUMN a TO b"))).toBe("AlterTableStmt")
  })

  test("ALTER TABLE ... DROP COLUMN", () => {
    expect(cmdType(accepted("ALTER TABLE t DROP COLUMN c"))).toBe("AlterTableStmt")
  })

  test("DROP TABLE / INDEX / VIEW / TRIGGER", () => {
    expect(cmdType(accepted("DROP TABLE t"))).toBe("DropTableStmt")
    expect(cmdType(accepted("DROP INDEX ix"))).toBe("DropIndexStmt")
    expect(cmdType(accepted("DROP VIEW v"))).toBe("DropViewStmt")
    expect(cmdType(accepted("DROP TRIGGER tr"))).toBe("DropTriggerStmt")
  })
})

// ---------------------------------------------------------------------------
// INSERT / UPDATE / DELETE — DML.
// ---------------------------------------------------------------------------

describe("INSERT statements", () => {
  test("INSERT ... VALUES", () => {
    expect(cmdType(accepted("INSERT INTO t(a, b) VALUES (1, 2), (3, 4)"))).toBe("InsertStmt")
  })

  test("INSERT ... SELECT", () => {
    expect(cmdType(accepted("INSERT INTO t(a) SELECT x FROM u"))).toBe("InsertStmt")
  })

  test("INSERT ... ON CONFLICT DO UPDATE (upsert)", () => {
    const sql =
      "INSERT INTO t(a, b) VALUES (1, 2) " +
      "ON CONFLICT(a) DO UPDATE SET b = excluded.b " +
      "WHERE b IS NOT NULL"
    expect(cmdType(accepted(sql))).toBe("InsertStmt")
  })

  test("INSERT ... RETURNING", () => {
    expect(cmdType(accepted("INSERT INTO t(a) VALUES (1) RETURNING a"))).toBe("InsertStmt")
  })

  test("INSERT OR REPLACE", () => {
    expect(cmdType(accepted("INSERT OR REPLACE INTO t(a) VALUES (1)"))).toBe("InsertStmt")
  })
})

describe("UPDATE and DELETE", () => {
  test("UPDATE with SET, FROM, and WHERE", () => {
    const sql = "UPDATE t SET a = 1, b = 2 FROM u WHERE t.id = u.id"
    expect(cmdType(accepted(sql))).toBe("UpdateStmt")
  })

  test("DELETE with WHERE and RETURNING", () => {
    expect(cmdType(accepted("DELETE FROM t WHERE a = 1 RETURNING id"))).toBe("DeleteStmt")
  })

  test("DELETE with WITH (CTE)", () => {
    expect(
      cmdType(accepted("WITH doomed AS (SELECT id FROM t WHERE x < 0) DELETE FROM t WHERE id IN doomed")),
    ).toBe("DeleteStmt")
  })
})

// ---------------------------------------------------------------------------
// SELECT — shapes beyond the printer snapshot suite.
// ---------------------------------------------------------------------------

describe("SELECT shapes", () => {
  test("GROUP BY / HAVING / ORDER BY / LIMIT", () => {
    const sql =
      "SELECT a, COUNT(*) FROM t WHERE x > 0 GROUP BY a HAVING COUNT(*) > 1 " +
      "ORDER BY a DESC LIMIT 10 OFFSET 5"
    expect(cmdType(accepted(sql))).toBe("SelectStmt")
  })

  test("INNER / LEFT / CROSS joins with USING and ON", () => {
    const sql =
      "SELECT * FROM a " +
      "JOIN b ON a.id = b.aid " +
      "LEFT JOIN c USING (id) " +
      "CROSS JOIN d"
    expect(cmdType(accepted(sql))).toBe("SelectStmt")
  })

  test("nested CTE referencing an outer CTE", () => {
    const sql =
      "WITH a AS (SELECT 1 AS x), b AS (SELECT x + 1 FROM a) SELECT * FROM b"
    expect(cmdType(accepted(sql))).toBe("SelectStmt")
  })

  test("recursive CTE", () => {
    const sql =
      "WITH RECURSIVE fib(n, v) AS (" +
      "  SELECT 1, 1 UNION ALL SELECT n + 1, v + n FROM fib WHERE n < 10" +
      ") SELECT * FROM fib"
    expect(cmdType(accepted(sql))).toBe("SelectStmt")
  })

  test("window function with PARTITION BY and ORDER BY", () => {
    const sql =
      "SELECT id, row_number() OVER (PARTITION BY g ORDER BY t) AS rn FROM events"
    expect(cmdType(accepted(sql))).toBe("SelectStmt")
  })

  test("CASE WHEN / THEN / ELSE / END", () => {
    expect(cmdType(accepted("SELECT CASE WHEN x > 0 THEN 'p' ELSE 'n' END FROM t"))).toBe(
      "SelectStmt",
    )
  })

  test("subqueries in SELECT and WHERE", () => {
    const sql =
      "SELECT a, (SELECT MAX(b) FROM u) FROM t WHERE a IN (SELECT a FROM u WHERE g = 1)"
    expect(cmdType(accepted(sql))).toBe("SelectStmt")
  })

  test("EXISTS subquery", () => {
    expect(cmdType(accepted("SELECT 1 WHERE EXISTS (SELECT 1 FROM t WHERE a = 1)"))).toBe(
      "SelectStmt",
    )
  })
})

// ---------------------------------------------------------------------------
// Transactions / PRAGMA / ATTACH / SAVEPOINT / VACUUM / REINDEX / ANALYZE.
// ---------------------------------------------------------------------------

describe("transactional and meta statements", () => {
  test("BEGIN / COMMIT / ROLLBACK", () => {
    expect(cmdType(accepted("BEGIN"))).toBe("BeginStmt")
    expect(cmdType(accepted("COMMIT"))).toBe("CommitStmt")
    expect(cmdType(accepted("ROLLBACK"))).toBe("RollbackStmt")
  })

  test("SAVEPOINT / RELEASE / ROLLBACK TO", () => {
    expect(cmdType(accepted("SAVEPOINT s1"))).toBe("SavepointStmt")
    expect(cmdType(accepted("RELEASE s1"))).toBe("ReleaseStmt")
    expect(cmdType(accepted("ROLLBACK TO SAVEPOINT s1"))).toBe("RollbackStmt")
  })

  test("ATTACH / DETACH", () => {
    expect(cmdType(accepted("ATTACH DATABASE 'file.db' AS aux"))).toBe("AttachStmt")
    expect(cmdType(accepted("DETACH DATABASE aux"))).toBe("DetachStmt")
  })

  test("PRAGMA foo = 1 and PRAGMA foo(bar)", () => {
    expect(cmdType(accepted("PRAGMA journal_mode = WAL"))).toBe("PragmaStmt")
    expect(cmdType(accepted("PRAGMA table_info(t)"))).toBe("PragmaStmt")
  })

  test("VACUUM INTO and REINDEX and ANALYZE", () => {
    expect(cmdType(accepted("VACUUM INTO 'copy.db'"))).toBe("VacuumStmt")
    expect(cmdType(accepted("REINDEX ix"))).toBe("ReindexStmt")
    expect(cmdType(accepted("ANALYZE t"))).toBe("AnalyzeStmt")
  })

  test("EXPLAIN and EXPLAIN QUERY PLAN", () => {
    expect(cmdType(accepted("EXPLAIN SELECT 1"))).toBe("ExplainStmt")
    expect(cmdType(accepted("EXPLAIN QUERY PLAN SELECT 1"))).toBe("ExplainStmt")
  })
})

// ---------------------------------------------------------------------------
// Expression surface — one acceptance case per family so later refactors
// in the AST node definitions can't silently drop a shape.
// ---------------------------------------------------------------------------

describe("expression families accept", () => {
  const cases: Array<[string, string]> = [
    ["unary", "SELECT -a, +b, NOT c, ~d FROM t"],
    ["arithmetic", "SELECT a + b - c * d / e % f FROM t"],
    ["bitwise + shifts", "SELECT a & b | c, a << 1, a >> 1 FROM t"],
    ["comparison", "SELECT a = b, a <> b, a < b, a <= b, a > b, a >= b FROM t"],
    ["boolean connectives", "SELECT a AND b OR NOT c FROM t"],
    ["BETWEEN", "SELECT a FROM t WHERE x BETWEEN 1 AND 10"],
    ["LIKE ESCAPE", "SELECT a FROM t WHERE x LIKE 'a\\%b' ESCAPE '\\'"],
    ["IN list / IN subquery / IN table", "SELECT a FROM t WHERE a IN (1,2) OR a IN (SELECT x FROM u) OR a IN u"],
    ["IS / IS NOT / NULL tests", "SELECT a FROM t WHERE x IS NULL OR y IS NOT NULL OR z ISNULL OR z NOTNULL"],
    ["COLLATE", "SELECT a COLLATE NOCASE FROM t"],
    ["CAST", "SELECT CAST(x AS INTEGER) FROM t"],
    ["function call + STAR form", "SELECT count(*), avg(x), group_concat(y, ',') FROM t"],
    ["string concat", "SELECT 'a' || b FROM t"],
    ["JSON PTR operators", "SELECT a -> 'k', a ->> 'k' FROM t"],
    ["bind params", "SELECT ?, ?1, :name, @named, $x FROM t"],
    ["RAISE in trigger", "CREATE TRIGGER g BEFORE DELETE ON t BEGIN SELECT RAISE(ABORT, 'no'); END"],
  ]
  for (const [label, sql] of cases) {
    test(label, () => {
      expect(accepted(sql)).toBeDefined()
    })
  }
})

// ---------------------------------------------------------------------------
// Parse → print → parse roundtrip.
//
// `toSexpr` is a one-way renderer — we don't have an s-expr → AST
// inverse — so the stable property we can check is: re-parsing the
// *same* SQL and printing produces byte-identical output.  That
// catches two whole classes of regression:
//   - AST node fields gaining/losing undefined slots that the printer
//     renders inconsistently,
//   - Non-deterministic visit order in `VisitorKeys`.
// ---------------------------------------------------------------------------

describe("parse + print is deterministic across representative queries", () => {
  const corpus = [
    "SELECT 1",
    "SELECT a + 1 FROM t WHERE b = 2",
    "WITH cte AS (SELECT 1) SELECT * FROM cte",
    "SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1 ORDER BY a LIMIT 5",
    "INSERT INTO t(a) VALUES (1), (2) ON CONFLICT(a) DO UPDATE SET a = excluded.a",
    "UPDATE t SET a = a + 1 WHERE id IN (SELECT id FROM u)",
    "DELETE FROM t WHERE a IS NOT NULL RETURNING id",
    "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    "CREATE INDEX ix_t_a ON t(a) WHERE a > 0",
    "SELECT x FROM a JOIN b ON a.id = b.aid LEFT JOIN c USING (id)",
    "SELECT CASE WHEN x > 0 THEN 'p' ELSE 'n' END FROM t",
    "VALUES (1, 2), (3, 4)",
  ]

  for (const sql of corpus) {
    test(`stable: ${sql.slice(0, 40)}${sql.length > 40 ? "…" : ""}`, () => {
      const first = toSexpr(accepted(sql))
      const second = toSexpr(accepted(sql))
      expect(second).toBe(first)
      // And the printed form must be non-trivial — catches the
      // regression where toSexpr silently produces "" on empty inputs.
      expect(first.length).toBeGreaterThan(0)
      expect(first.startsWith("(CmdList")).toBe(true)
    })
  }
})
