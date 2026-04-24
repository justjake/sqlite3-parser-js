// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_update.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../../src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_update.test", () => {
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
  test("#6 statement ok: UPDATE t1 SET x=1 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=1 WHERE x>0",
      line: 24,
      conditions: [],
    })
  })
  test("#7 statement ok: UPDATE t1 SET x=2 WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=2 WHERE x>0",
      line: 27,
      conditions: [],
    })
  })
  test("#8 statement ok: UPDATE t1 SET y='true' WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET y='true' WHERE x>0",
      line: 30,
      conditions: [],
    })
  })
  test("#9 statement ok: UPDATE t1 SET y='unknown' WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET y='unknown' WHERE x>0",
      line: 33,
      conditions: [],
    })
  })
  test("#10 statement error: UPDATE t1 SET z='foo'", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "UPDATE t1 SET z='foo'",
      line: 36,
      conditions: [],
    })
  })
  test("#11 statement error: UPDATE t1 SET z='foo' WHERE x>0", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "UPDATE t1 SET z='foo' WHERE x>0",
      line: 39,
      conditions: [],
    })
  })
  test("#12 statement ok: UPDATE t1 SET x=3", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=3",
      line: 45,
      conditions: [],
    })
  })
  test("#13 query I rowsort: SELECT count(*) FROM t1 WHERE x=3", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=3",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 48,
      conditions: [],
    })
  })
  test("#14 statement ok: UPDATE t1 SET x=1 WHERE y='unknown'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=1 WHERE y='unknown'",
      line: 56,
      conditions: [],
    })
  })
  test("#15 query I rowsort: SELECT count(*) FROM t1 WHERE x=1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 59,
      conditions: [],
    })
  })
  test("#16 statement ok: UPDATE t1 SET x=1 WHERE y='foo'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=1 WHERE y='foo'",
      line: 68,
      conditions: [],
    })
  })
  test("#17 statement ok: UPDATE t1 SET x=3+1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=3+1",
      line: 75,
      conditions: [],
    })
  })
  test("#18 query I rowsort: SELECT count(*) FROM t1 WHERE x=4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=4",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 78,
      conditions: [],
    })
  })
  // skipif mssql
  test("#19 statement ok: UPDATE t1 SET x=3, x=4, x=5", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=3, x=4, x=5",
      line: 88,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 87,
        },
      ],
    })
  })
  // skipif mssql
  test("#20 query I rowsort: SELECT count(*) FROM t1 WHERE x=3", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=3",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 92,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 91,
        },
      ],
    })
  })
  // skipif mssql
  test("#21 query I rowsort: SELECT count(*) FROM t1 WHERE x=4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=4",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 98,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 97,
        },
      ],
    })
  })
  // skipif mssql
  test("#22 query I rowsort: SELECT count(*) FROM t1 WHERE x=5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=5",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 104,
      conditions: [
        {
          kind: "skipif",
          engine: "mssql",
          line: 103,
        },
      ],
    })
  })
  test("#23 query I rowsort: SELECT count(*) FROM t1 WHERE y='unknown'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE y='unknown'",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 112,
      conditions: [],
    })
  })
  test("#24 statement ok: UPDATE t1 SET x=2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=2",
      line: 117,
      conditions: [],
    })
  })
  test("#25 query I rowsort: SELECT count(*) FROM t1 WHERE y='unknown'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE y='unknown'",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 120,
      conditions: [],
    })
  })
  test("#26 statement ok: UPDATE t1 SET x=x+2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "UPDATE t1 SET x=x+2",
      line: 131,
      conditions: [],
    })
  })
  test("#27 query I rowsort: SELECT count(*) FROM t1 WHERE x=4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "rowsort",
      sql: "SELECT count(*) FROM t1 WHERE x=4",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 134,
      conditions: [],
    })
  })
})
