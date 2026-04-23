// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_dropview.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../../src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_dropview.test", () => {
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
      line: 27,
      conditions: [],
    })
  })
  test("#7 statement ok: DROP VIEW view1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP VIEW view1",
      line: 30,
      conditions: [],
    })
  })
  test("#8 statement error: DROP VIEW view1", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP VIEW view1",
      line: 34,
      conditions: [],
    })
  })
  test("#9 statement error: DROP VIEW viewX", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "DROP VIEW viewX",
      line: 38,
      conditions: [],
    })
  })
  test("#10 statement ok: CREATE VIEW view2 AS SELECT x FROM t1 WHERE x=0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIEW view2 AS SELECT x FROM t1 WHERE x=0",
      line: 41,
      conditions: [],
    })
  })
  test("#11 query I rowsort label-0: SELECT x FROM view2", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      label: "label-0",
      sql: "SELECT x FROM view2",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 48,
      conditions: [],
    })
  })
  test("#12 statement ok: DROP VIEW view2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "DROP VIEW view2",
      line: 53,
      conditions: [],
    })
  })
  test("#13 query I rowsort label-0: SELECT x FROM t1 WHERE x=0", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      label: "label-0",
      sql: "SELECT x FROM t1 WHERE x=0",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 56,
      conditions: [],
    })
  })
})
