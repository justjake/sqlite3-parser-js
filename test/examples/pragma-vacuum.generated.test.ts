// Generated from test/examples/pragma-vacuum.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/pragma-vacuum.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER)",
      line: 5,
      conditions: [],
    })
  })
  test("#2 statement ok: VACUUM main", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "VACUUM main",
      line: 10,
      conditions: [],
    })
  })
  test("#3 statement ok: VACUUM main INTO 'backup.db'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "VACUUM main INTO 'backup.db'",
      line: 15,
      conditions: [],
    })
  })
  test("#4 statement ok: PRAGMA foreign_keys", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA foreign_keys",
      line: 19,
      conditions: [],
    })
  })
  test("#5 statement ok: PRAGMA cache_size = -2000", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA cache_size = -2000",
      line: 26,
      conditions: [],
    })
  })
  test("#6 statement ok: PRAGMA cache_size(-4000)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA cache_size(-4000)",
      line: 29,
      conditions: [],
    })
  })
  test("#7 statement ok: PRAGMA cache_size = +4000", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA cache_size = +4000",
      line: 32,
      conditions: [],
    })
  })
  test("#8 statement ok: PRAGMA foreign_keys = ON", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA foreign_keys = ON",
      line: 39,
      conditions: [],
    })
  })
  test("#9 statement ok: PRAGMA secure_delete = DELETE", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA secure_delete = DELETE",
      line: 42,
      conditions: [],
    })
  })
  test("#10 statement ok: PRAGMA encoding = DEFAULT", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA encoding = DEFAULT",
      line: 45,
      conditions: [],
    })
  })
  test("#11 statement ok: PRAGMA busy_timeout = +5000", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "PRAGMA busy_timeout = +5000",
      line: 48,
      conditions: [],
    })
  })
  test("#12 statement ok: ATTACH DATABASE 'other.db' AS other KEY 'secretpass'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ATTACH DATABASE 'other.db' AS other KEY 'secretpass'",
      line: 53,
      conditions: [],
    })
  })
  test("#13 statement ok: REINDEX", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "REINDEX",
      line: 57,
      conditions: [],
    })
  })
  test("#14 statement ok: ANALYZE", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ANALYZE",
      line: 61,
      conditions: [],
    })
  })
  test("#15 statement ok: DETACH other", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DETACH other",
      line: 65,
      conditions: [],
    })
  })
})
