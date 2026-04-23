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
  test("#2 statement ok: CREATE TABLE t_cte(a INTEGER, b INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t_cte(a INTEGER, b INTEGER)",
      line: 11,
      conditions: [],
    })
  })
  test("#3 statement ok: WITH RECURSIVE counter(n) AS ( SELECT 1 UNION ALL SELECT n…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE counter(n) AS (\n  SELECT 1\n  UNION ALL\n  SELECT n + 1 FROM counter WHERE n < 10\n)\nDELETE FROM t_cte WHERE a IN (SELECT n FROM counter)",
      line: 14,
      conditions: [],
    })
  })
  test("#4 statement ok: WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n +…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counter WHERE n < 5)\nUPDATE t_cte SET b = 1 WHERE a IN (SELECT n FROM counter)",
      line: 22,
      conditions: [],
    })
  })
  test("#5 statement ok: WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n +…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counter WHERE n < 5)\nINSERT INTO t_cte(a, b) SELECT n, n FROM counter",
      line: 26,
      conditions: [],
    })
  })
  test("#6 statement ok: WITH counter2(n) AS (SELECT 1) DELETE FROM t_cte WHERE a IN…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH counter2(n) AS (SELECT 1)\nDELETE FROM t_cte WHERE a IN (SELECT n FROM counter2)",
      line: 32,
      conditions: [],
    })
  })
  test("#7 statement ok: WITH RECURSIVE counter(n) AS ( SELECT 1 UNION ALL SELECT n…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE counter(n) AS (\n  SELECT 1\n  UNION ALL\n  SELECT n + 1 FROM counter WHERE n < 10\n)\nSELECT * FROM counter",
      line: 38,
      conditions: [],
    })
  })
  test("#8 statement ok: WITH c1 AS MATERIALIZED (SELECT a FROM t1) SELECT * FROM c1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH c1 AS MATERIALIZED (SELECT a FROM t1)\nSELECT * FROM c1",
      line: 47,
      conditions: [],
    })
  })
  test("#9 statement ok: WITH c2 AS NOT MATERIALIZED (SELECT a FROM t1) SELECT * FRO…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH c2 AS NOT MATERIALIZED (SELECT a FROM t1)\nSELECT * FROM c2",
      line: 52,
      conditions: [],
    })
  })
  test("#10 statement ok: WITH RECURSIVE base AS MATERIALIZED (SELECT 1 AS n), rec(n)…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "WITH RECURSIVE\n  base AS MATERIALIZED (SELECT 1 AS n),\n  rec(n) AS NOT MATERIALIZED (\n    SELECT n FROM base\n    UNION ALL\n    SELECT n + 1 FROM rec WHERE n < 5\n  )\nSELECT * FROM rec",
      line: 57,
      conditions: [],
    })
  })
})
