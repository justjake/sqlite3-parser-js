// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_createtrigger.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "/Users/jitl/src/sqlite3-parser-js/src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_createtrigger.test", () => {
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
  test("#7 statement error: CREATE TRIGGER t1r1 UPDATE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "CREATE TRIGGER t1r1 UPDATE ON t1 BEGIN SELECT 1; END;",
      line: 28,
      conditions: [],
    })
  })
  test("#8 statement ok: CREATE TRIGGER t1r2 DELETE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r2 DELETE ON t1 BEGIN SELECT 1; END;",
      line: 39,
      conditions: [],
    })
  })
  test("#9 statement ok: CREATE TRIGGER t1r3 INSERT ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r3 INSERT ON t1 BEGIN SELECT 1; END;",
      line: 42,
      conditions: [],
    })
  })
  test("#10 statement ok: CREATE TRIGGER t1r4 UPDATE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r4 UPDATE ON t1 BEGIN SELECT 1; END;",
      line: 45,
      conditions: [],
    })
  })
  test("#11 statement ok: CREATE TRIGGER t1r5 AFTER DELETE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r5 AFTER DELETE ON t1 BEGIN SELECT 1; END;",
      line: 80,
      conditions: [],
    })
  })
  test("#12 statement ok: CREATE TRIGGER t1r6 AFTER INSERT ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r6 AFTER INSERT ON t1 BEGIN SELECT 1; END;",
      line: 83,
      conditions: [],
    })
  })
  test("#13 statement ok: CREATE TRIGGER t1r7 AFTER UPDATE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r7 AFTER UPDATE ON t1 BEGIN SELECT 1; END;",
      line: 86,
      conditions: [],
    })
  })
  test("#14 statement ok: CREATE TRIGGER t1r8 BEFORE DELETE ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r8 BEFORE DELETE ON t1 BEGIN SELECT 1; END;",
      line: 89,
      conditions: [],
    })
  })
  test("#15 statement ok: CREATE TRIGGER t1r9 BEFORE INSERT ON t1 BEGIN SELECT 1; END;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r9 BEFORE INSERT ON t1 BEGIN SELECT 1; END;",
      line: 92,
      conditions: [],
    })
  })
  test("#16 statement ok: CREATE TRIGGER t1r10 BEFORE UPDATE ON t1 BEGIN SELECT 1; EN…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER t1r10 BEFORE UPDATE ON t1 BEGIN SELECT 1; END;",
      line: 95,
      conditions: [],
    })
  })
  test("#17 statement ok: DROP TRIGGER t1r1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r1",
      line: 191,
      conditions: [],
    })
  })
  test("#18 statement ok: DROP TRIGGER t1r2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r2",
      line: 194,
      conditions: [],
    })
  })
  test("#19 statement ok: DROP TRIGGER t1r3", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r3",
      line: 197,
      conditions: [],
    })
  })
  test("#20 statement ok: DROP TRIGGER t1r4", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r4",
      line: 200,
      conditions: [],
    })
  })
  test("#21 statement ok: DROP TRIGGER t1r5", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r5",
      line: 203,
      conditions: [],
    })
  })
  test("#22 statement ok: DROP TRIGGER t1r6", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r6",
      line: 206,
      conditions: [],
    })
  })
  test("#23 statement ok: DROP TRIGGER t1r7", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r7",
      line: 209,
      conditions: [],
    })
  })
  test("#24 statement ok: DROP TRIGGER t1r8", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r8",
      line: 212,
      conditions: [],
    })
  })
  test("#25 statement ok: DROP TRIGGER t1r9", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r9",
      line: 215,
      conditions: [],
    })
  })
  test("#26 statement ok: DROP TRIGGER t1r10", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TRIGGER t1r10",
      line: 218,
      conditions: [],
    })
  })
})
