// Generated from test/examples/dml-upsert.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/dml-upsert.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER PRIMARY KEY, b INTEGER, c INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER PRIMARY KEY, b INTEGER, c INTEGER)",
      line: 6,
      conditions: [],
    })
  })
  test("#2 statement ok: INSERT INTO t1 DEFAULT VALUES", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 DEFAULT VALUES",
      line: 10,
      conditions: [],
    })
  })
  test("#3 statement ok: INSERT INTO t1(a, b) DEFAULT VALUES", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1(a, b) DEFAULT VALUES",
      line: 13,
      conditions: [],
    })
  })
  test("#4 statement ok: INSERT INTO t1(b, c) VALUES (1, 2) RETURNING a, b", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1(b, c) VALUES (1, 2) RETURNING a, b",
      line: 20,
      conditions: [],
    })
  })
  test("#5 statement ok: DELETE FROM t1 RETURNING a", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DELETE FROM t1 RETURNING a",
      line: 23,
      conditions: [],
    })
  })
  test("#6 statement ok: UPDATE t1 SET b = 5 RETURNING a, b", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET b = 5 RETURNING a, b",
      line: 26,
      conditions: [],
    })
  })
  test("#7 statement ok: DELETE FROM t1 WHERE a = 1 RETURNING a", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DELETE FROM t1 WHERE a = 1 RETURNING a",
      line: 29,
      conditions: [],
    })
  })
  test("#8 statement ok: UPDATE t1 SET b = 5 WHERE a = 1 RETURNING a, b", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET b = 5 WHERE a = 1 RETURNING a, b",
      line: 32,
      conditions: [],
    })
  })
  test("#9 statement ok: DELETE FROM main.t1 WHERE a = 1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DELETE FROM main.t1 WHERE a = 1",
      line: 36,
      conditions: [],
    })
  })
  test("#10 statement ok: UPDATE main.t1 SET b = 1 WHERE a = 1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE main.t1 SET b = 1 WHERE a = 1",
      line: 39,
      conditions: [],
    })
  })
  test("#11 statement ok: INSERT INTO main.t1(a, b) VALUES (99, 100)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO main.t1(a, b) VALUES (99, 100)",
      line: 42,
      conditions: [],
    })
  })
  test("#12 statement ok: INSERT INTO t1(a, b) VALUES (1, 2) ON CONFLICT (a) DO NOTHI…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1(a, b) VALUES (1, 2)\n  ON CONFLICT (a) DO NOTHING\n  ON CONFLICT (b) DO NOTHING",
      line: 48,
      conditions: [],
    })
  })
  test("#13 statement ok: INSERT INTO t1(a, b) VALUES (1, 2) ON CONFLICT DO NOTHING R…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1(a, b) VALUES (1, 2)\n  ON CONFLICT DO NOTHING\n  RETURNING a",
      line: 55,
      conditions: [],
    })
  })
  test("#14 statement ok: INSERT INTO t1(a, b) VALUES (1, 2) ON CONFLICT DO UPDATE SE…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1(a, b) VALUES (1, 2)\n  ON CONFLICT DO UPDATE SET b = b + 1 WHERE a > 0\n  RETURNING a, b",
      line: 62,
      conditions: [],
    })
  })
  test("#15 statement ok: UPDATE t1 SET (b, c) = (10, 20) WHERE a = 1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET (b, c) = (10, 20) WHERE a = 1",
      line: 71,
      conditions: [],
    })
  })
  test("#16 statement ok: UPDATE t1 SET a = 1, (b, c) = (2, 3) WHERE a = 1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET a = 1, (b, c) = (2, 3) WHERE a = 1",
      line: 74,
      conditions: [],
    })
  })
})
