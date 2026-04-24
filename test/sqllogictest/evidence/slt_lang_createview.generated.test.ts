// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_createview.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../../src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_createview.test", () => {
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
  test("#6 statement ok: CREATE VIEW view1 AS SELECT x FROM t1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIEW view1 AS SELECT x FROM t1 WHERE x>0",
      line: 22,
      conditions: [],
    })
  })
  test("#7 statement error: CREATE VIEW view1 AS SELECT x FROM t1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "CREATE VIEW view1 AS SELECT x FROM t1 WHERE x>0",
      line: 26,
      conditions: [],
    })
  })
  test("#8 query I rowsort label-0: SELECT x FROM t1 WHERE x>0", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      label: "label-0",
      sql: "SELECT x FROM t1 WHERE x>0",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 29,
      conditions: [],
    })
  })
  test("#9 query I rowsort label-0: SELECT x FROM view1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      label: "label-0",
      sql: "SELECT x FROM view1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 34,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#10 statement ok: CREATE TEMP VIEW view2 AS SELECT x FROM t1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TEMP VIEW view2 AS SELECT x FROM t1 WHERE x>0",
      line: 48,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 47,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#11 statement ok: CREATE TEMPORARY VIEW view3 AS SELECT x FROM t1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TEMPORARY VIEW view3 AS SELECT x FROM t1 WHERE x>0",
      line: 52,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 51,
        },
      ],
    })
  })
  // skipif mssql
  test("#12 statement error: DELETE FROM view1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DELETE FROM view1 WHERE x>0",
      line: 69,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 68,
        },
      ],
    })
  })
  test("#14 statement error: INSERT INTO view1 VALUES(2,'unknown')", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "INSERT INTO view1 VALUES(2,'unknown')",
      line: 76,
      conditions: [],
    })
  })
  // skipif mssql
  test("#15 statement error: UPDATE view1 SET x=2", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "UPDATE view1 SET x=2",
      line: 80,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 79,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#17 statement error: DELETE FROM view1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DELETE FROM view1 WHERE x>0",
      line: 90,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 89,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#18 statement error: INSERT INTO view1 VALUES(2,'unknown')", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "INSERT INTO view1 VALUES(2,'unknown')",
      line: 94,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 93,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#19 statement error: INSERT OR REPLACE INTO view1 VALUES(2,'unknown')", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "INSERT OR REPLACE INTO view1 VALUES(2,'unknown')",
      line: 98,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 97,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#20 statement error: UPDATE view1 SET x=2", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "UPDATE view1 SET x=2",
      line: 102,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 101,
        },
      ],
    })
  })
  test("#21 statement ok: DROP VIEW view1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP VIEW view1",
      line: 111,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#22 statement ok: DROP VIEW view2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP VIEW view2",
      line: 115,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 114,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#23 statement ok: DROP VIEW view3", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP VIEW view3",
      line: 119,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 118,
        },
      ],
    })
  })
  test("#24 statement error: DROP VIEW view1", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP VIEW view1",
      line: 123,
      conditions: [],
    })
  })
  test("#25 statement error: DROP VIEW viewX", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP VIEW viewX",
      line: 127,
      conditions: [],
    })
  })
})
