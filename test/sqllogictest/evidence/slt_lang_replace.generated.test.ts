// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_replace.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../../src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_replace.test", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // onlyif mssql
  // halt
  // onlyif oracle
  // halt
  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1( x INTEGER PRIMARY KEY, y VARCHAR(16) )", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1( x INTEGER PRIMARY KEY, y VARCHAR(16) )",
      line: 11,
      conditions: [],
    })
  })
  test("#2 statement ok: INSERT INTO t1 VALUES(1, 'true')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(1, 'true')",
      line: 14,
      conditions: [],
    })
  })
  test("#3 statement ok: INSERT INTO t1 VALUES(0, 'false')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(0, 'false')",
      line: 17,
      conditions: [],
    })
  })
  test("#4 query IT rowsort: SELECT x, y FROM t1 WHERE x=2", () => {
    driver.runRecord({
      type: "query",
      types: "IT",
      sort: "rowsort",
      sql: "SELECT x, y FROM t1 WHERE x=2",
      expected: {
        kind: "values",
        values: [],
      },
      line: 24,
      conditions: [],
    })
  })
  test("#5 statement ok: INSERT INTO t1 VALUES(2, 'insert')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(2, 'insert')",
      line: 28,
      conditions: [],
    })
  })
  test("#6 query IT rowsort: SELECT x, y FROM t1 WHERE x=2", () => {
    driver.runRecord({
      type: "query",
      types: "IT",
      sort: "rowsort",
      sql: "SELECT x, y FROM t1 WHERE x=2",
      expected: {
        kind: "values",
        values: ["2", "insert"],
      },
      line: 31,
      conditions: [],
    })
  })
  // skipif mysql
  test("#7 statement ok: INSERT OR REPLACE INTO t1 VALUES(2, 'insert or replace')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT OR REPLACE INTO t1 VALUES(2, 'insert or replace')",
      line: 38,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 37,
        },
      ],
    })
  })
  // skipif mysql
  test("#8 query IT rowsort: SELECT x, y FROM t1 WHERE x=2", () => {
    driver.runRecord({
      type: "query",
      types: "IT",
      sort: "rowsort",
      sql: "SELECT x, y FROM t1 WHERE x=2",
      expected: {
        kind: "values",
        values: ["2", "insert or replace"],
      },
      line: 42,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 41,
        },
      ],
    })
  })
  test("#9 statement ok: REPLACE INTO t1 VALUES(2, 'replace')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "REPLACE INTO t1 VALUES(2, 'replace')",
      line: 48,
      conditions: [],
    })
  })
  test("#10 query IT rowsort: SELECT x, y FROM t1 WHERE x=2", () => {
    driver.runRecord({
      type: "query",
      types: "IT",
      sort: "rowsort",
      sql: "SELECT x, y FROM t1 WHERE x=2",
      expected: {
        kind: "values",
        values: ["2", "replace"],
      },
      line: 51,
      conditions: [],
    })
  })
  // skipif mysql
  test("#11 statement ok: INSERT OR REPLACE INTO t1 VALUES(3, 'insert or replace (new…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT OR REPLACE INTO t1 VALUES(3, 'insert or replace (new)')",
      line: 58,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 57,
        },
      ],
    })
  })
  // skipif mysql
  test("#12 query IT rowsort: SELECT x, y FROM t1 WHERE x=3", () => {
    driver.runRecord({
      type: "query",
      types: "IT",
      sort: "rowsort",
      sql: "SELECT x, y FROM t1 WHERE x=3",
      expected: {
        kind: "values",
        values: ["3", "insert or replace (new)"],
      },
      line: 62,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 61,
        },
      ],
    })
  })
  test("#13 statement ok: REPLACE INTO t1 VALUES(4, 'replace (new)')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "REPLACE INTO t1 VALUES(4, 'replace (new)')",
      line: 68,
      conditions: [],
    })
  })
  test("#14 query IT rowsort: SELECT x, y FROM t1 WHERE x=4", () => {
    driver.runRecord({
      type: "query",
      types: "IT",
      sort: "rowsort",
      sql: "SELECT x, y FROM t1 WHERE x=4",
      expected: {
        kind: "values",
        values: ["4", "replace (new)"],
      },
      line: 71,
      conditions: [],
    })
  })
})
