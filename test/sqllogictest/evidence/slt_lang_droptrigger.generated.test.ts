// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_droptrigger.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "/Users/jitl/src/sqlite3-parser-js/src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_droptrigger.test", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1( x INTEGER, y VARCHAR(8) )", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1( x INTEGER, y VARCHAR(8) )",
      line: 3,
      conditions: [],
    })
  })
  test("#2 statement ok: INSERT INTO t1 VALUES(1,'true')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(1,'true')",
      line: 6,
      conditions: [],
    })
  })
  test("#3 statement ok: INSERT INTO t1 VALUES(0,'false')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(0,'false')",
      line: 9,
      conditions: [],
    })
  })
  test("#4 statement ok: INSERT INTO t1 VALUES(NULL,'NULL')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(NULL,'NULL')",
      line: 12,
      conditions: [],
    })
  })
  test("#5 statement ok: CREATE INDEX t1i1 ON t1(x)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE INDEX t1i1 ON t1(x)",
      line: 15,
      conditions: [],
    })
  })
  // onlyif mssql
  // halt
  test("#6 statement ok: CREATE TRIGGER t1r1 UPDATE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r1 UPDATE ON t1 BEGIN SELECT 1; END;",
      line: 24,
      conditions: [],
    })
  })
  test("#7 statement ok: DROP TRIGGER t1r1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r1",
      line: 27,
      conditions: [],
    })
  })
  test("#8 statement error: DROP TRIGGER t1r1", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP TRIGGER t1r1",
      line: 31,
      conditions: [],
    })
  })
  test("#9 statement error: DROP TRIGGER tXrX", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP TRIGGER tXrX",
      line: 35,
      conditions: [],
    })
  })
  test("#10 statement ok: CREATE TRIGGER t1r1 UPDATE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r1 UPDATE ON t1 BEGIN SELECT 1; END;",
      line: 44,
      conditions: [],
    })
  })
  test("#11 statement ok: DROP TABLE t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TABLE t1",
      line: 47,
      conditions: [],
    })
  })
  test("#12 statement error: DROP TRIGGER t1r1", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP TRIGGER t1r1",
      line: 51,
      conditions: [],
    })
  })
})
