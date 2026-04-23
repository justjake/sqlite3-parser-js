// Generated from test/examples/cte.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/cte.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER, b INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER, b INTEGER)",
      line: 5,
      conditions: [],
    })
  })
  test("#2 statement ok: WITH RECURSIVE counter(n) AS ( SELECT 1 UNION ALL SELECT n…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE counter(n) AS (\n  SELECT 1\n  UNION ALL\n  SELECT n + 1 FROM counter WHERE n < 10\n)\nSELECT * FROM counter",
      line: 9,
      conditions: [],
    })
  })
  test("#3 statement ok: WITH c1 AS MATERIALIZED (SELECT a FROM t1) SELECT * FROM c1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH c1 AS MATERIALIZED (SELECT a FROM t1)\nSELECT * FROM c1",
      line: 18,
      conditions: [],
    })
  })
  test("#4 statement ok: WITH c2 AS NOT MATERIALIZED (SELECT a FROM t1) SELECT * FRO…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH c2 AS NOT MATERIALIZED (SELECT a FROM t1)\nSELECT * FROM c2",
      line: 23,
      conditions: [],
    })
  })
  test("#5 statement ok: WITH RECURSIVE base AS MATERIALIZED (SELECT 1 AS n), rec(n)…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE\n  base AS MATERIALIZED (SELECT 1 AS n),\n  rec(n) AS NOT MATERIALIZED (\n    SELECT n FROM base\n    UNION ALL\n    SELECT n + 1 FROM rec WHERE n < 5\n  )\nSELECT * FROM rec",
      line: 28,
      conditions: [],
    })
  })
})
