// Generated from vendor/submodule/sqllogictest/test/evidence/in2.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "/Users/jitl/src/sqlite3-parser-js/src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/in2.test", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // skipif oracle
  test("#1 statement ok: CREATE TABLE t1( x INTEGER, y TEXT )", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1( x INTEGER, y TEXT )",
      line: 24,
      conditions: [
        {
          kind: "skipif",
          engine: "oracle",
          line: 23,
        },
      ],
    })
  })
  // onlyif oracle
  test.skip("#2 statement ok: CREATE TABLE t1( x INTEGER, y VARCHAR(8) )", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1( x INTEGER, y VARCHAR(8) )",
      line: 28,
      conditions: [
        {
          kind: "onlyif",
          engine: "oracle",
          line: 27,
        },
      ],
    })
  })
  test("#3 statement ok: INSERT INTO t1 VALUES(1,'true')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(1,'true')",
      line: 31,
      conditions: [],
    })
  })
  test("#4 statement ok: INSERT INTO t1 VALUES(0,'false')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(0,'false')",
      line: 34,
      conditions: [],
    })
  })
  test("#5 statement ok: INSERT INTO t1 VALUES(NULL,'NULL')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(NULL,'NULL')",
      line: 37,
      conditions: [],
    })
  })
  test("#6 query I nosort: SELECT 1 FROM t1 WHERE 1 IN (2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 IN (2)",
      expected: {
        kind: "values",
        values: [],
      },
      line: 42,
      conditions: [],
    })
  })
  test("#7 query I nosort: SELECT 1 FROM t1 WHERE 1.0 IN (2.0)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 IN (2.0)",
      expected: {
        kind: "values",
        values: [],
      },
      line: 46,
      conditions: [],
    })
  })
  test("#8 query I nosort: SELECT 1 FROM t1 WHERE '1' IN ('2')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' IN ('2')",
      expected: {
        kind: "values",
        values: [],
      },
      line: 50,
      conditions: [],
    })
  })
  test("#9 query I nosort: SELECT 1 FROM t1 WHERE 1 NOT IN (2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 NOT IN (2)",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 54,
      conditions: [],
    })
  })
  test("#10 query I nosort: SELECT 1 FROM t1 WHERE 1.0 NOT IN (2.0)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 NOT IN (2.0)",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 61,
      conditions: [],
    })
  })
  test("#11 query I nosort: SELECT 1 FROM t1 WHERE '1' NOT IN ('2')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' NOT IN ('2')",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 68,
      conditions: [],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#12 query I nosort: SELECT 1 FROM t1 WHERE 1 IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 IN ()",
      expected: {
        kind: "values",
        values: [],
      },
      line: 81,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 78,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 79,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 80,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#13 query I nosort: SELECT 1 FROM t1 WHERE 1.0 IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 IN ()",
      expected: {
        kind: "values",
        values: [],
      },
      line: 88,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 85,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 86,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 87,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#14 query I nosort: SELECT 1 FROM t1 WHERE '1' IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' IN ()",
      expected: {
        kind: "values",
        values: [],
      },
      line: 95,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 92,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 93,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 94,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#15 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ()",
      expected: {
        kind: "values",
        values: [],
      },
      line: 102,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 99,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 100,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 101,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#16 query I nosort: SELECT 1 FROM t1 WHERE 1 NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 NOT IN ()",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 109,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 106,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 107,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 108,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#17 query I nosort: SELECT 1 FROM t1 WHERE 1.0 NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 NOT IN ()",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 119,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 116,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 117,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 118,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#18 query I nosort: SELECT 1 FROM t1 WHERE '1' NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' NOT IN ()",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 129,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 126,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 127,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 128,
        },
      ],
    })
  })
  // skipif mysql
  // skipif mssql
  // skipif oracle
  test("#19 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ()",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 139,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 136,
        },
        {
          kind: "skipif",
          engine: "mssql",
          line: 137,
        },
        {
          kind: "skipif",
          engine: "oracle",
          line: 138,
        },
      ],
    })
  })
  test("#20 query I nosort: SELECT 1 FROM t1 WHERE 1 IN ( NULL, 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 IN ( NULL, 1 )",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 148,
      conditions: [],
    })
  })
  test("#21 query I nosort: SELECT 1 FROM t1 WHERE 1.0 IN ( NULL, 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 IN ( NULL, 1.0 )",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 155,
      conditions: [],
    })
  })
  test("#22 query I nosort: SELECT 1 FROM t1 WHERE '1' IN ( NULL, '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' IN ( NULL, '1' )",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 162,
      conditions: [],
    })
  })
  test("#23 query I nosort: SELECT 1 FROM t1 WHERE 1 NOT IN ( NULL, 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 NOT IN ( NULL, 1 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 169,
      conditions: [],
    })
  })
  test("#24 query I nosort: SELECT 1 FROM t1 WHERE 1.0 NOT IN ( NULL, 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 NOT IN ( NULL, 1.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 173,
      conditions: [],
    })
  })
  test("#25 query I nosort: SELECT 1 FROM t1 WHERE '1' NOT IN ( NULL, '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' NOT IN ( NULL, '1' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 177,
      conditions: [],
    })
  })
  test("#26 query I nosort: SELECT 1 FROM t1 WHERE 1 IN ( 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 IN ( 1 )",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 181,
      conditions: [],
    })
  })
  test("#27 query I nosort: SELECT 1 FROM t1 WHERE 1.0 IN ( 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 IN ( 1.0 )",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 188,
      conditions: [],
    })
  })
  test("#28 query I nosort: SELECT 1 FROM t1 WHERE '1' IN ( '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' IN ( '1' )",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 195,
      conditions: [],
    })
  })
  test("#29 query I nosort: SELECT 1 FROM t1 WHERE 1 NOT IN ( 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 NOT IN ( 1 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 202,
      conditions: [],
    })
  })
  test("#30 query I nosort: SELECT 1 FROM t1 WHERE 1.0 NOT IN ( 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 NOT IN ( 1.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 206,
      conditions: [],
    })
  })
  test("#31 query I nosort: SELECT 1 FROM t1 WHERE '1' NOT IN ( '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' NOT IN ( '1' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 210,
      conditions: [],
    })
  })
  test("#32 query I nosort: SELECT 1 FROM t1 WHERE 1 IN ( NULL, 2 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 IN ( NULL, 2 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 217,
      conditions: [],
    })
  })
  test("#33 query I nosort: SELECT 1 FROM t1 WHERE 1.0 IN ( NULL, 2.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 IN ( NULL, 2.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 221,
      conditions: [],
    })
  })
  test("#34 query I nosort: SELECT 1 FROM t1 WHERE '1' IN ( NULL, '2' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' IN ( NULL, '2' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 225,
      conditions: [],
    })
  })
  test("#35 query I nosort: SELECT 1 FROM t1 WHERE 1 NOT IN ( NULL, 2 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 NOT IN ( NULL, 2 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 229,
      conditions: [],
    })
  })
  test("#36 query I nosort: SELECT 1 FROM t1 WHERE 1.0 NOT IN ( NULL, 2.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1.0 NOT IN ( NULL, 2.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 233,
      conditions: [],
    })
  })
  test("#37 query I nosort: SELECT 1 FROM t1 WHERE '1' NOT IN ( NULL, '2' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE '1' NOT IN ( NULL, '2' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 237,
      conditions: [],
    })
  })
  test("#38 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ( 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ( 1 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 244,
      conditions: [],
    })
  })
  test("#39 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ( 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ( 1.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 248,
      conditions: [],
    })
  })
  test("#40 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ( '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ( '1' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 252,
      conditions: [],
    })
  })
  test("#41 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ( 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ( 1 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 256,
      conditions: [],
    })
  })
  test("#42 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ( 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ( 1.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 260,
      conditions: [],
    })
  })
  test("#43 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ( '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ( '1' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 264,
      conditions: [],
    })
  })
  test("#44 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ( NULL, 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ( NULL, 1 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 268,
      conditions: [],
    })
  })
  test("#45 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ( NULL, 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ( NULL, 1.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 272,
      conditions: [],
    })
  })
  test("#46 query I nosort: SELECT 1 FROM t1 WHERE NULL IN ( NULL, '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL IN ( NULL, '1' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 276,
      conditions: [],
    })
  })
  test("#47 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ( NULL, 1 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ( NULL, 1 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 280,
      conditions: [],
    })
  })
  test("#48 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ( NULL, 1.0 )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ( NULL, 1.0 )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 284,
      conditions: [],
    })
  })
  test("#49 query I nosort: SELECT 1 FROM t1 WHERE NULL NOT IN ( NULL, '1' )", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE NULL NOT IN ( NULL, '1' )",
      expected: {
        kind: "values",
        values: [],
      },
      line: 288,
      conditions: [],
    })
  })
  test("#50 query I nosort: SELECT 1 FROM t1 WHERE 1 IN (SELECT 1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 FROM t1 WHERE 1 IN (SELECT 1)",
      expected: {
        kind: "values",
        values: ["1", "1", "1"],
      },
      line: 296,
      conditions: [],
    })
  })
  test("#51 statement error: SELECT 1 FROM t1 WHERE 1 IN (SELECT 1,2)", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "SELECT 1 FROM t1 WHERE 1 IN (SELECT 1,2)",
      line: 303,
      conditions: [],
    })
  })
  test("#52 statement error: SELECT 1 FROM t1 WHERE 1 IN (SELECT x,y FROM t1)", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "SELECT 1 FROM t1 WHERE 1 IN (SELECT x,y FROM t1)",
      line: 306,
      conditions: [],
    })
  })
  test("#53 statement error: SELECT 1 FROM t1 WHERE 1 IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "SELECT 1 FROM t1 WHERE 1 IN (SELECT * FROM t1)",
      line: 309,
      conditions: [],
    })
  })
  test("#54 statement error: SELECT 1 FROM t1 WHERE 1 IN (SELECT min(x),max(x) FROM t1)", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "SELECT 1 FROM t1 WHERE 1 IN (SELECT min(x),max(x) FROM t1)",
      line: 312,
      conditions: [],
    })
  })
})
