// Generated from test/examples/window.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/window.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER, b INTEGER, g INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER, b INTEGER, g INTEGER)",
      line: 7,
      conditions: [],
    })
  })
  test("#2 statement ok: SELECT a, sum(b) OVER w FROM t1 WINDOW w AS (ORDER BY a)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a, sum(b) OVER w FROM t1 WINDOW w AS (ORDER BY a)",
      line: 15,
      conditions: [],
    })
  })
  test("#3 statement ok: SELECT a, sum(b) OVER w1, avg(b) OVER w2 FROM t1 WINDOW w1…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a,\n  sum(b) OVER w1,\n  avg(b) OVER w2\nFROM t1\nWINDOW\n  w1 AS (PARTITION BY g),\n  w2 AS (ORDER BY a)",
      line: 20,
      conditions: [],
    })
  })
  test("#4 statement ok: SELECT a, sum(b) OVER w_inherit FROM t1 WINDOW w_base AS (O…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a, sum(b) OVER w_inherit FROM t1\nWINDOW\n  w_base AS (ORDER BY a),\n  w_inherit AS (w_base PARTITION BY g)",
      line: 31,
      conditions: [],
    })
  })
  test("#5 statement ok: SELECT a, sum(b) OVER w_ord FROM t1 WINDOW w_base2 AS (PART…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a, sum(b) OVER w_ord FROM t1\nWINDOW\n  w_base2 AS (PARTITION BY g),\n  w_ord AS (w_base2 ORDER BY a DESC)",
      line: 38,
      conditions: [],
    })
  })
  test("#6 statement ok: SELECT a, sum(b) OVER w_frame FROM t1 WINDOW w_base3 AS (OR…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a, sum(b) OVER w_frame FROM t1\nWINDOW\n  w_base3 AS (ORDER BY a),\n  w_frame AS (w_base3 ROWS 3 PRECEDING)",
      line: 45,
      conditions: [],
    })
  })
  test("#7 statement ok: SELECT sum(b) OVER (ORDER BY a RANGE UNBOUNDED PRECEDING) F…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (ORDER BY a RANGE UNBOUNDED PRECEDING) FROM t1",
      line: 56,
      conditions: [],
    })
  })
  test("#8 statement ok: SELECT sum(b) OVER (ORDER BY a ROWS 3 PRECEDING) FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (ORDER BY a ROWS 3 PRECEDING) FROM t1",
      line: 62,
      conditions: [],
    })
  })
  test("#9 statement ok: SELECT sum(b) OVER (ORDER BY a GROUPS CURRENT ROW) FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (ORDER BY a GROUPS CURRENT ROW) FROM t1",
      line: 67,
      conditions: [],
    })
  })
  test("#10 statement ok: SELECT sum(b) OVER ( ORDER BY a ROWS BETWEEN 5 PRECEDING AN…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (\n  ORDER BY a\n  ROWS BETWEEN 5 PRECEDING AND 5 FOLLOWING\n) FROM t1",
      line: 74,
      conditions: [],
    })
  })
  test("#11 statement ok: SELECT sum(b) OVER ( ORDER BY a RANGE BETWEEN UNBOUNDED PRE…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (\n  ORDER BY a\n  RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING\n) FROM t1",
      line: 80,
      conditions: [],
    })
  })
  test("#12 statement ok: SELECT sum(b) OVER ( ORDER BY a ROWS BETWEEN UNBOUNDED PREC…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (\n  ORDER BY a\n  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  EXCLUDE NO OTHERS\n) FROM t1",
      line: 91,
      conditions: [],
    })
  })
  test("#13 statement ok: SELECT sum(b) OVER ( ORDER BY a ROWS BETWEEN UNBOUNDED PREC…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (\n  ORDER BY a\n  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  EXCLUDE CURRENT ROW\n) FROM t1",
      line: 98,
      conditions: [],
    })
  })
  test("#14 statement ok: SELECT sum(b) OVER ( ORDER BY a ROWS BETWEEN UNBOUNDED PREC…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (\n  ORDER BY a\n  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  EXCLUDE GROUP\n) FROM t1",
      line: 105,
      conditions: [],
    })
  })
  test("#15 statement ok: SELECT sum(b) OVER ( ORDER BY a ROWS BETWEEN UNBOUNDED PREC…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT sum(b) OVER (\n  ORDER BY a\n  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\n  EXCLUDE TIES\n) FROM t1",
      line: 112,
      conditions: [],
    })
  })
})
