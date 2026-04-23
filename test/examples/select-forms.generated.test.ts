// Generated from test/examples/select-forms.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/select-forms.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER, b INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER, b INTEGER)",
      line: 7,
      conditions: [],
    })
  })
  test("#2 statement ok: CREATE TABLE t2(x INTEGER, y INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t2(x INTEGER, y INTEGER)",
      line: 10,
      conditions: [],
    })
  })
  test("#3 statement ok: CREATE INDEX t1_a ON t1(a)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE INDEX t1_a ON t1(a)",
      line: 13,
      conditions: [],
    })
  })
  test("#4 statement ok: SELECT t1.* FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT t1.* FROM t1",
      line: 17,
      conditions: [],
    })
  })
  test("#5 statement ok: SELECT t1.*, t2.x FROM t1, t2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT t1.*, t2.x FROM t1, t2",
      line: 20,
      conditions: [],
    })
  })
  test("#6 statement ok: SELECT * FROM json_each('[1, 2, 3]')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT * FROM json_each('[1, 2, 3]')",
      line: 25,
      conditions: [],
    })
  })
  test("#7 statement ok: SELECT * FROM json_tree('{}', '$') AS jt", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT * FROM json_tree('{}', '$') AS jt",
      line: 28,
      conditions: [],
    })
  })
  test("#8 statement ok: CREATE INDEX main.ix_t1_b ON t1(b)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE INDEX main.ix_t1_b ON t1(b)",
      line: 34,
      conditions: [],
    })
  })
  test("#9 statement ok: INSERT INTO t1 AS alias1(a, b) VALUES (1, 2)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 AS alias1(a, b) VALUES (1, 2)",
      line: 37,
      conditions: [],
    })
  })
  test("#10 statement ok: INSERT INTO main.t1 AS alias2(a, b) VALUES (3, 4)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO main.t1 AS alias2(a, b) VALUES (3, 4)",
      line: 40,
      conditions: [],
    })
  })
  test("#11 statement ok: SELECT * FROM t1 NATURAL LEFT OUTER JOIN t2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT * FROM t1 NATURAL LEFT OUTER JOIN t2",
      line: 45,
      conditions: [],
    })
  })
  test("#12 statement ok: SELECT a FROM t1 INDEXED BY t1_a WHERE a > 0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 INDEXED BY t1_a WHERE a > 0",
      line: 49,
      conditions: [],
    })
  })
  test("#13 statement ok: SELECT a FROM t1 ORDER BY b ASC NULLS FIRST", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 ORDER BY b ASC NULLS FIRST",
      line: 54,
      conditions: [],
    })
  })
  test("#14 statement ok: SELECT a FROM t1 ORDER BY b DESC NULLS LAST", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 ORDER BY b DESC NULLS LAST",
      line: 57,
      conditions: [],
    })
  })
  test("#15 statement ok: SELECT a FROM t1 LIMIT 5, 10", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 LIMIT 5, 10",
      line: 62,
      conditions: [],
    })
  })
  test("#16 statement ok: SELECT a, sum(b) OVER w FROM t1 GROUP BY a HAVING a > 0 WIN…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a, sum(b) OVER w FROM t1 GROUP BY a HAVING a > 0 WINDOW w AS (ORDER BY a)",
      line: 69,
      conditions: [],
    })
  })
})
