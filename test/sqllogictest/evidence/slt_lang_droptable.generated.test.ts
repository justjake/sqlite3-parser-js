// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_droptable.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "/Users/jitl/src/sqlite3-parser-js/src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_droptable.test", () => {
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
  test("#6 statement ok: DROP TABLE t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TABLE t1",
      line: 22,
      conditions: [],
    })
  })
  test("#7 statement error: DROP TABLE t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP TABLE t1",
      line: 26,
      conditions: [],
    })
  })
  test("#8 statement error: DROP TABLE tX", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP TABLE tX",
      line: 30,
      conditions: [],
    })
  })
  test("#9 statement error: DROP INDEX t1i1;", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP INDEX t1i1;",
      line: 40,
      conditions: [],
    })
  })
  test("#10 statement ok: CREATE TABLE t1( x INTEGER, y VARCHAR(8) )", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1( x INTEGER, y VARCHAR(8) )",
      line: 46,
      conditions: [],
    })
  })
  // skipif mssql
  test("#11 statement ok: DROP TABLE IF EXISTS t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TABLE IF EXISTS t1",
      line: 50,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 49,
        },
      ],
    })
  })
  // skipif mssql
  test("#12 statement ok: DROP TABLE IF EXISTS t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP TABLE IF EXISTS t1",
      line: 54,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 53,
        },
      ],
    })
  })
})
