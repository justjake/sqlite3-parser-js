// Generated from vendor/submodule/sqllogictest/test/evidence/in1.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../../src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/in1.test", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // onlyif mssql
  // halt
  // onlyif oracle
  // halt
  // onlyif sqlite
  test("#1 query I nosort: SELECT 1 IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 IN ()",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 23,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 22,
        },
      ],
    })
  })
  test("#2 query I nosort: SELECT 1 IN (2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 IN (2)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 28,
      conditions: [],
    })
  })
  test("#3 query I nosort: SELECT 1 IN (2,3,4,5,6,7,8,9)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 IN (2,3,4,5,6,7,8,9)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 33,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#4 query I nosort: SELECT 1 NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 NOT IN ()",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 39,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 38,
        },
      ],
    })
  })
  test("#5 query I nosort: SELECT 1 NOT IN (2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 NOT IN (2)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 44,
      conditions: [],
    })
  })
  test("#6 query I nosort: SELECT 1 NOT IN (2,3,4,5,6,7,8,9)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 NOT IN (2,3,4,5,6,7,8,9)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 49,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#7 query I nosort: SELECT null IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null IN ()",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 55,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 54,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#8 query I nosort: SELECT null NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null NOT IN ()",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 61,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 60,
        },
      ],
    })
  })
  test("#9 statement ok: CREATE TABLE t1(x INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(x INTEGER)",
      line: 66,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#10 query I nosort label-1: SELECT 1 IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-1",
      sql: "SELECT 1 IN t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 70,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 69,
        },
      ],
    })
  })
  test("#11 query I nosort label-1: SELECT 1 IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-1",
      sql: "SELECT 1 IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 75,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#12 query I nosort label-2: SELECT 1 NOT IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-2",
      sql: "SELECT 1 NOT IN t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 81,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 80,
        },
      ],
    })
  })
  test("#13 query I nosort label-2: SELECT 1 NOT IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-2",
      sql: "SELECT 1 NOT IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 86,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#14 query I nosort label-3: SELECT null IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-3",
      sql: "SELECT null IN t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 92,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 91,
        },
      ],
    })
  })
  test("#15 query I nosort label-3: SELECT null IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-3",
      sql: "SELECT null IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 97,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#16 query I nosort label-4: SELECT null NOT IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-4",
      sql: "SELECT null NOT IN t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 103,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 102,
        },
      ],
    })
  })
  test("#17 query I nosort label-4: SELECT null NOT IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-4",
      sql: "SELECT null NOT IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 108,
      conditions: [],
    })
  })
  test("#18 statement ok: CREATE TABLE t2(y INTEGER PRIMARY KEY)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t2(y INTEGER PRIMARY KEY)",
      line: 113,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#19 query I nosort label-5: SELECT 1 IN t2", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-5",
      sql: "SELECT 1 IN t2",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 117,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 116,
        },
      ],
    })
  })
  test("#20 query I nosort label-5: SELECT 1 IN (SELECT * FROM t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-5",
      sql: "SELECT 1 IN (SELECT * FROM t2)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 122,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#21 query I nosort label-6: SELECT 1 NOT IN t2", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-6",
      sql: "SELECT 1 NOT IN t2",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 128,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 127,
        },
      ],
    })
  })
  test("#22 query I nosort label-6: SELECT 1 NOT IN (SELECT * FROM t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-6",
      sql: "SELECT 1 NOT IN (SELECT * FROM t2)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 133,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#23 query I nosort label-7: SELECT null IN t2", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-7",
      sql: "SELECT null IN t2",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 139,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 138,
        },
      ],
    })
  })
  test("#24 query I nosort label-7: SELECT null IN (SELECT * FROM t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-7",
      sql: "SELECT null IN (SELECT * FROM t2)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 144,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#25 query I nosort label-8: SELECT null NOT IN t2", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-8",
      sql: "SELECT null NOT IN t2",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 150,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 149,
        },
      ],
    })
  })
  test("#26 query I nosort label-8: SELECT null NOT IN (SELECT * FROM t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-8",
      sql: "SELECT null NOT IN (SELECT * FROM t2)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 155,
      conditions: [],
    })
  })
  test("#27 statement ok: CREATE TABLE t3(z INTEGER UNIQUE)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t3(z INTEGER UNIQUE)",
      line: 160,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#28 query I nosort label-9: SELECT 1 IN t3", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-9",
      sql: "SELECT 1 IN t3",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 164,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 163,
        },
      ],
    })
  })
  test("#29 query I nosort label-9: SELECT 1 IN (SELECT * FROM t3)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-9",
      sql: "SELECT 1 IN (SELECT * FROM t3)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 169,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#30 query I nosort label-10: SELECT 1 NOT IN t3", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-10",
      sql: "SELECT 1 NOT IN t3",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 175,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 174,
        },
      ],
    })
  })
  test("#31 query I nosort label-10: SELECT 1 NOT IN (SELECT * FROM t3)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-10",
      sql: "SELECT 1 NOT IN (SELECT * FROM t3)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 180,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#32 query I nosort label-11: SELECT null IN t3", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-11",
      sql: "SELECT null IN t3",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 186,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 185,
        },
      ],
    })
  })
  test("#33 query I nosort label-11: SELECT null IN (SELECT * FROM t3)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-11",
      sql: "SELECT null IN (SELECT * FROM t3)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 191,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#34 query I nosort label-12: SELECT null NOT IN t3", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-12",
      sql: "SELECT null NOT IN t3",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 197,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 196,
        },
      ],
    })
  })
  test("#35 query I nosort label-12: SELECT null NOT IN (SELECT * FROM t3)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-12",
      sql: "SELECT null NOT IN (SELECT * FROM t3)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 202,
      conditions: [],
    })
  })
  test("#36 query I nosort: SELECT 1 IN (SELECT x+y FROM t1, t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 IN (SELECT x+y FROM t1, t2)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 207,
      conditions: [],
    })
  })
  test("#37 query I nosort: SELECT 1 NOT IN (SELECT x+y FROM t1,t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 NOT IN (SELECT x+y FROM t1,t2)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 212,
      conditions: [],
    })
  })
  test("#38 query I nosort: SELECT null IN (SELECT x+y FROM t1,t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null IN (SELECT x+y FROM t1,t2)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 217,
      conditions: [],
    })
  })
  test("#39 query I nosort: SELECT null NOT IN (SELECT x+y FROM t1,t2)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null NOT IN (SELECT x+y FROM t1,t2)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 222,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#40 query I nosort: SELECT 1.23 IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1.23 IN ()",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 228,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 227,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#41 query I nosort: SELECT 1.23 NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1.23 NOT IN ()",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 234,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 233,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#42 query I nosort label-13: SELECT 1.23 IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-13",
      sql: "SELECT 1.23 IN t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 240,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 239,
        },
      ],
    })
  })
  test("#43 query I nosort label-13: SELECT 1.23 IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-13",
      sql: "SELECT 1.23 IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 245,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#44 query I nosort label-14: SELECT 1.23 NOT IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-14",
      sql: "SELECT 1.23 NOT IN t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 251,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 250,
        },
      ],
    })
  })
  test("#45 query I nosort label-14: SELECT 1.23 NOT IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-14",
      sql: "SELECT 1.23 NOT IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 256,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#46 query I nosort: SELECT 'hello' IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'hello' IN ()",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 262,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 261,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#47 query I nosort: SELECT 'hello' NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'hello' NOT IN ()",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 268,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 267,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#48 query I nosort label-15: SELECT 'hello' IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-15",
      sql: "SELECT 'hello' IN t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 274,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 273,
        },
      ],
    })
  })
  test("#49 query I nosort label-15: SELECT 'hello' IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-15",
      sql: "SELECT 'hello' IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 279,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#50 query I nosort label-16: SELECT 'hello' NOT IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-16",
      sql: "SELECT 'hello' NOT IN t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 285,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 284,
        },
      ],
    })
  })
  test("#51 query I nosort label-16: SELECT 'hello' NOT IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-16",
      sql: "SELECT 'hello' NOT IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 290,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#52 query I nosort: SELECT x'303132' IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT x'303132' IN ()",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 296,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 295,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#53 query I nosort: SELECT x'303132' NOT IN ()", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT x'303132' NOT IN ()",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 302,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 301,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#54 query I nosort label-17: SELECT x'303132' IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-17",
      sql: "SELECT x'303132' IN t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 308,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 307,
        },
      ],
    })
  })
  test("#55 query I nosort label-17: SELECT x'303132' IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-17",
      sql: "SELECT x'303132' IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 313,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#56 query I nosort label-18: SELECT x'303132' NOT IN t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-18",
      sql: "SELECT x'303132' NOT IN t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 319,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 318,
        },
      ],
    })
  })
  test("#57 query I nosort label-18: SELECT x'303132' NOT IN (SELECT * FROM t1)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-18",
      sql: "SELECT x'303132' NOT IN (SELECT * FROM t1)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 324,
      conditions: [],
    })
  })
  test("#58 query I nosort: SELECT 1 IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 339,
      conditions: [],
    })
  })
  test("#59 query I nosort: SELECT 1 NOT IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 NOT IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 344,
      conditions: [],
    })
  })
  test("#60 query I nosort: SELECT 'a' IN ('b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'a' IN ('b','c','d')",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 349,
      conditions: [],
    })
  })
  test("#61 query I nosort: SELECT 'a' NOT IN ('b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'a' NOT IN ('b','c','d')",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 354,
      conditions: [],
    })
  })
  test("#62 statement ok: CREATE TABLE t4(a INTEGER UNIQUE)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t4(a INTEGER UNIQUE)",
      line: 359,
      conditions: [],
    })
  })
  test("#63 statement ok: CREATE TABLE t5(b INTEGER PRIMARY KEY)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t5(b INTEGER PRIMARY KEY)",
      line: 362,
      conditions: [],
    })
  })
  test("#64 statement ok: CREATE TABLE t6(c INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t6(c INTEGER)",
      line: 365,
      conditions: [],
    })
  })
  test("#65 statement ok: INSERT INTO t4 VALUES(2)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t4 VALUES(2)",
      line: 368,
      conditions: [],
    })
  })
  test("#66 statement ok: INSERT INTO t4 VALUES(3)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t4 VALUES(3)",
      line: 371,
      conditions: [],
    })
  })
  test("#67 statement ok: INSERT INTO t4 VALUES(4)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t4 VALUES(4)",
      line: 374,
      conditions: [],
    })
  })
  test("#68 statement ok: INSERT INTO t5 SELECT * FROM t4", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t5 SELECT * FROM t4",
      line: 377,
      conditions: [],
    })
  })
  test("#69 statement ok: INSERT INTO t6 SELECT * FROM t4", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t6 SELECT * FROM t4",
      line: 380,
      conditions: [],
    })
  })
  test("#70 statement ok: CREATE TABLE t4n(a INTEGER UNIQUE)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t4n(a INTEGER UNIQUE)",
      line: 383,
      conditions: [],
    })
  })
  test("#71 statement ok: CREATE TABLE t6n(c INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t6n(c INTEGER)",
      line: 386,
      conditions: [],
    })
  })
  test("#72 statement ok: INSERT INTO t4n SELECT * FROM t4", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t4n SELECT * FROM t4",
      line: 389,
      conditions: [],
    })
  })
  test("#73 statement ok: INSERT INTO t4n VALUES(null)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t4n VALUES(null)",
      line: 392,
      conditions: [],
    })
  })
  test("#74 statement ok: INSERT INTO t6n SELECT * FROM t4n", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t6n SELECT * FROM t4n",
      line: 395,
      conditions: [],
    })
  })
  // skipif mysql
  test("#75 statement ok: CREATE TABLE t7(a TEXT UNIQUE)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t7(a TEXT UNIQUE)",
      line: 399,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 398,
        },
      ],
    })
  })
  // onlyif mysql
  test("#76 statement ok: CREATE TABLE t7(a TEXT, UNIQUE (a(1)))", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t7(a TEXT, UNIQUE (a(1)))",
      line: 403,
      conditions: [
        {
          kind: "onlyif",
          engine: "mysql",
          line: 402,
        },
      ],
    })
  })
  test("#77 statement ok: CREATE TABLE t8(c TEXT)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t8(c TEXT)",
      line: 406,
      conditions: [],
    })
  })
  test("#78 statement ok: INSERT INTO t7 VALUES('b')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t7 VALUES('b')",
      line: 409,
      conditions: [],
    })
  })
  test("#79 statement ok: INSERT INTO t7 VALUES('c')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t7 VALUES('c')",
      line: 412,
      conditions: [],
    })
  })
  test("#80 statement ok: INSERT INTO t7 VALUES('d')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t7 VALUES('d')",
      line: 415,
      conditions: [],
    })
  })
  test("#81 statement ok: INSERT INTO t8 SELECT * FROM t7", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t8 SELECT * FROM t7",
      line: 418,
      conditions: [],
    })
  })
  // skipif mysql
  test("#82 statement ok: CREATE TABLE t7n(a TEXT UNIQUE)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t7n(a TEXT UNIQUE)",
      line: 422,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 421,
        },
      ],
    })
  })
  // onlyif mysql
  test("#83 statement ok: CREATE TABLE t7n(a TEXT, UNIQUE (a(1)))", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t7n(a TEXT, UNIQUE (a(1)))",
      line: 426,
      conditions: [
        {
          kind: "onlyif",
          engine: "mysql",
          line: 425,
        },
      ],
    })
  })
  test("#84 statement ok: CREATE TABLE t8n(c TEXT)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t8n(c TEXT)",
      line: 429,
      conditions: [],
    })
  })
  test("#85 statement ok: INSERT INTO t7n SELECT * FROM t7", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t7n SELECT * FROM t7",
      line: 432,
      conditions: [],
    })
  })
  test("#86 statement ok: INSERT INTO t7n VALUES(null)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t7n VALUES(null)",
      line: 435,
      conditions: [],
    })
  })
  test("#87 statement ok: INSERT INTO t8n SELECT * FROM t7n", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t8n SELECT * FROM t7n",
      line: 438,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#88 query I nosort label-19: SELECT 1 IN t4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-19",
      sql: "SELECT 1 IN t4",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 442,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 441,
        },
      ],
    })
  })
  test("#89 query I nosort label-19: SELECT 1 IN (SELECT * FROM t4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-19",
      sql: "SELECT 1 IN (SELECT * FROM t4)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 447,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#90 query I nosort label-20: SELECT 1 NOT IN t4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-20",
      sql: "SELECT 1 NOT IN t4",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 453,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 452,
        },
      ],
    })
  })
  test("#91 query I nosort label-20: SELECT 1 NOT IN (SELECT * FROM t4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-20",
      sql: "SELECT 1 NOT IN (SELECT * FROM t4)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 458,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#92 query I nosort label-21: SELECT 1 IN t5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-21",
      sql: "SELECT 1 IN t5",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 464,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 463,
        },
      ],
    })
  })
  test("#93 query I nosort label-21: SELECT 1 IN (SELECT * FROM t5)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-21",
      sql: "SELECT 1 IN (SELECT * FROM t5)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 469,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#94 query I nosort label-22: SELECT 1 NOT IN t5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-22",
      sql: "SELECT 1 NOT IN t5",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 475,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 474,
        },
      ],
    })
  })
  test("#95 query I nosort label-22: SELECT 1 NOT IN (SELECT * FROM t5)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-22",
      sql: "SELECT 1 NOT IN (SELECT * FROM t5)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 480,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#96 query I nosort label-23: SELECT 1 IN t6", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-23",
      sql: "SELECT 1 IN t6",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 486,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 485,
        },
      ],
    })
  })
  test("#97 query I nosort label-23: SELECT 1 IN (SELECT * FROM t6)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-23",
      sql: "SELECT 1 IN (SELECT * FROM t6)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 491,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#98 query I nosort label-24: SELECT 1 NOT IN t6", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-24",
      sql: "SELECT 1 NOT IN t6",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 497,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 496,
        },
      ],
    })
  })
  test("#99 query I nosort label-24: SELECT 1 NOT IN (SELECT * FROM t6)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-24",
      sql: "SELECT 1 NOT IN (SELECT * FROM t6)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 502,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#100 query I nosort label-25: SELECT 'a' IN t7", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-25",
      sql: "SELECT 'a' IN t7",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 508,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 507,
        },
      ],
    })
  })
  test("#101 query I nosort label-25: SELECT 'a' IN (SELECT * FROM t7)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-25",
      sql: "SELECT 'a' IN (SELECT * FROM t7)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 513,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#102 query I nosort label-26: SELECT 'a' NOT IN t7", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-26",
      sql: "SELECT 'a' NOT IN t7",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 519,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 518,
        },
      ],
    })
  })
  test("#103 query I nosort label-26: SELECT 'a' NOT IN (SELECT * FROM t7)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-26",
      sql: "SELECT 'a' NOT IN (SELECT * FROM t7)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 524,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#104 query I nosort label-27: SELECT 'a' IN t8", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-27",
      sql: "SELECT 'a' IN t8",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 530,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 529,
        },
      ],
    })
  })
  test("#105 query I nosort label-27: SELECT 'a' IN (SELECT * FROM t8)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-27",
      sql: "SELECT 'a' IN (SELECT * FROM t8)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 535,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#106 query I nosort label-28: SELECT 'a' NOT IN t8", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-28",
      sql: "SELECT 'a' NOT IN t8",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 541,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 540,
        },
      ],
    })
  })
  test("#107 query I nosort label-28: SELECT 'a' NOT IN (SELECT * FROM t8)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-28",
      sql: "SELECT 'a' NOT IN (SELECT * FROM t8)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 546,
      conditions: [],
    })
  })
  test("#108 query I nosort: SELECT 2 IN (2,3,4,null)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 2 IN (2,3,4,null)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 555,
      conditions: [],
    })
  })
  test("#109 query I nosort: SELECT 3 NOT IN (2,3,4,null)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 3 NOT IN (2,3,4,null)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 560,
      conditions: [],
    })
  })
  test("#110 query I nosort: SELECT 4 IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 4 IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 565,
      conditions: [],
    })
  })
  test("#111 query I nosort: SELECT 2 NOT IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 2 NOT IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 570,
      conditions: [],
    })
  })
  test("#112 query I nosort: SELECT 'b' IN ('b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'b' IN ('b','c','d')",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 575,
      conditions: [],
    })
  })
  test("#113 query I nosort: SELECT 'c' NOT IN ('b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'c' NOT IN ('b','c','d')",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 580,
      conditions: [],
    })
  })
  test("#114 query I nosort: SELECT 'd' IN ('b','c',null,'d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'd' IN ('b','c',null,'d')",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 585,
      conditions: [],
    })
  })
  test("#115 query I nosort: SELECT 'b' NOT IN (null,'b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'b' NOT IN (null,'b','c','d')",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 590,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#116 query I nosort label-29: SELECT 2 IN t4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-29",
      sql: "SELECT 2 IN t4",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 596,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 595,
        },
      ],
    })
  })
  test("#117 query I nosort label-29: SELECT 2 IN (SELECT * FROM t4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-29",
      sql: "SELECT 2 IN (SELECT * FROM t4)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 601,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#118 query I nosort label-30: SELECT 3 NOT IN t4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-30",
      sql: "SELECT 3 NOT IN t4",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 607,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 606,
        },
      ],
    })
  })
  test("#119 query I nosort label-30: SELECT 3 NOT IN (SELECT * FROM t4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-30",
      sql: "SELECT 3 NOT IN (SELECT * FROM t4)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 612,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#120 query I nosort label-31: SELECT 4 IN t4n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-31",
      sql: "SELECT 4 IN t4n",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 618,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 617,
        },
      ],
    })
  })
  test("#121 query I nosort label-31: SELECT 4 IN (SELECT * FROM t4n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-31",
      sql: "SELECT 4 IN (SELECT * FROM t4n)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 623,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#122 query I nosort label-32: SELECT 2 NOT IN t4n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-32",
      sql: "SELECT 2 NOT IN t4n",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 629,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 628,
        },
      ],
    })
  })
  test("#123 query I nosort label-32: SELECT 2 NOT IN (SELECT * FROM t4n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-32",
      sql: "SELECT 2 NOT IN (SELECT * FROM t4n)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 634,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#124 query I nosort label-33: SELECT 2 IN t5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-33",
      sql: "SELECT 2 IN t5",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 640,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 639,
        },
      ],
    })
  })
  test("#125 query I nosort label-33: SELECT 2 IN (SELECT * FROM t5)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-33",
      sql: "SELECT 2 IN (SELECT * FROM t5)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 645,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#126 query I nosort label-34: SELECT 3 NOT IN t5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-34",
      sql: "SELECT 3 NOT IN t5",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 651,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 650,
        },
      ],
    })
  })
  test("#127 query I nosort label-34: SELECT 3 NOT IN (SELECT * FROM t5)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-34",
      sql: "SELECT 3 NOT IN (SELECT * FROM t5)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 656,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#128 query I nosort label-35: SELECT 2 IN t6", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-35",
      sql: "SELECT 2 IN t6",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 662,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 661,
        },
      ],
    })
  })
  test("#129 query I nosort label-35: SELECT 2 IN (SELECT * FROM t6)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-35",
      sql: "SELECT 2 IN (SELECT * FROM t6)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 667,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#130 query I nosort label-36: SELECT 3 NOT IN t6", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-36",
      sql: "SELECT 3 NOT IN t6",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 673,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 672,
        },
      ],
    })
  })
  test("#131 query I nosort label-36: SELECT 3 NOT IN (SELECT * FROM t6)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-36",
      sql: "SELECT 3 NOT IN (SELECT * FROM t6)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 678,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#132 query I nosort label-37: SELECT 4 IN t6n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-37",
      sql: "SELECT 4 IN t6n",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 684,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 683,
        },
      ],
    })
  })
  test("#133 query I nosort label-37: SELECT 4 IN (SELECT * FROM t6n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-37",
      sql: "SELECT 4 IN (SELECT * FROM t6n)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 689,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#134 query I nosort label-38: SELECT 2 NOT IN t6n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-38",
      sql: "SELECT 2 NOT IN t6n",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 695,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 694,
        },
      ],
    })
  })
  test("#135 query I nosort label-38: SELECT 2 NOT IN (SELECT * FROM t6n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-38",
      sql: "SELECT 2 NOT IN (SELECT * FROM t6n)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 700,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#136 query I nosort label-39: SELECT 'b' IN t7", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-39",
      sql: "SELECT 'b' IN t7",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 706,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 705,
        },
      ],
    })
  })
  test("#137 query I nosort label-39: SELECT 'b' IN (SELECT * FROM t7)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-39",
      sql: "SELECT 'b' IN (SELECT * FROM t7)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 711,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#138 query I nosort label-40: SELECT 'c' NOT IN t7", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-40",
      sql: "SELECT 'c' NOT IN t7",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 717,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 716,
        },
      ],
    })
  })
  test("#139 query I nosort label-40: SELECT 'c' NOT IN (SELECT * FROM t7)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-40",
      sql: "SELECT 'c' NOT IN (SELECT * FROM t7)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 722,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#140 query I nosort label-41: SELECT 'c' IN t7n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-41",
      sql: "SELECT 'c' IN t7n",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 728,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 727,
        },
      ],
    })
  })
  test("#141 query I nosort label-41: SELECT 'c' IN (SELECT * FROM t7n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-41",
      sql: "SELECT 'c' IN (SELECT * FROM t7n)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 733,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#142 query I nosort label-42: SELECT 'd' NOT IN t7n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-42",
      sql: "SELECT 'd' NOT IN t7n",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 739,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 738,
        },
      ],
    })
  })
  test("#143 query I nosort label-42: SELECT 'd' NOT IN (SELECT * FROM t7n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-42",
      sql: "SELECT 'd' NOT IN (SELECT * FROM t7n)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 744,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#144 query I nosort label-43: SELECT 'b' IN t8", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-43",
      sql: "SELECT 'b' IN t8",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 750,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 749,
        },
      ],
    })
  })
  test("#145 query I nosort label-43: SELECT 'b' IN (SELECT * FROM t8)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-43",
      sql: "SELECT 'b' IN (SELECT * FROM t8)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 755,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#146 query I nosort label-44: SELECT 'c' NOT IN t8", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-44",
      sql: "SELECT 'c' NOT IN t8",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 761,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 760,
        },
      ],
    })
  })
  test("#147 query I nosort label-44: SELECT 'c' NOT IN (SELECT * FROM t8)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-44",
      sql: "SELECT 'c' NOT IN (SELECT * FROM t8)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 766,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#148 query I nosort label-45: SELECT 'c' IN t8n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-45",
      sql: "SELECT 'c' IN t8n",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 772,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 771,
        },
      ],
    })
  })
  test("#149 query I nosort label-45: SELECT 'c' IN (SELECT * FROM t8n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-45",
      sql: "SELECT 'c' IN (SELECT * FROM t8n)",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 777,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#150 query I nosort label-46: SELECT 'd' NOT IN t8n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-46",
      sql: "SELECT 'd' NOT IN t8n",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 783,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 782,
        },
      ],
    })
  })
  test("#151 query I nosort label-46: SELECT 'd' NOT IN (SELECT * FROM t8n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-46",
      sql: "SELECT 'd' NOT IN (SELECT * FROM t8n)",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 788,
      conditions: [],
    })
  })
  test("#152 query I nosort: SELECT 1 IN (2,3,4,null)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 IN (2,3,4,null)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 795,
      conditions: [],
    })
  })
  test("#153 query I nosort: SELECT 1 NOT IN (2,3,4,null)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 1 NOT IN (2,3,4,null)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 800,
      conditions: [],
    })
  })
  test("#154 query I nosort: SELECT 'a' IN ('b','c',null,'d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'a' IN ('b','c',null,'d')",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 805,
      conditions: [],
    })
  })
  test("#155 query I nosort: SELECT 'a' NOT IN (null,'b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT 'a' NOT IN (null,'b','c','d')",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 810,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#156 query I nosort label-47: SELECT 1 IN t4n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-47",
      sql: "SELECT 1 IN t4n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 816,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 815,
        },
      ],
    })
  })
  test("#157 query I nosort label-47: SELECT 1 IN (SELECT * FROM t4n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-47",
      sql: "SELECT 1 IN (SELECT * FROM t4n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 821,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#158 query I nosort label-48: SELECT 5 NOT IN t4n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-48",
      sql: "SELECT 5 NOT IN t4n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 827,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 826,
        },
      ],
    })
  })
  test("#159 query I nosort label-48: SELECT 5 NOT IN (SELECT * FROM t4n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-48",
      sql: "SELECT 5 NOT IN (SELECT * FROM t4n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 832,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#160 query I nosort label-49: SELECT 6 IN t6n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-49",
      sql: "SELECT 6 IN t6n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 838,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 837,
        },
      ],
    })
  })
  test("#161 query I nosort label-49: SELECT 6 IN (SELECT * FROM t6n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-49",
      sql: "SELECT 6 IN (SELECT * FROM t6n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 843,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#162 query I nosort label-50: SELECT 7 NOT IN t6n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-50",
      sql: "SELECT 7 NOT IN t6n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 849,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 848,
        },
      ],
    })
  })
  test("#163 query I nosort label-50: SELECT 7 NOT IN (SELECT * FROM t6n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-50",
      sql: "SELECT 7 NOT IN (SELECT * FROM t6n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 854,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#164 query I nosort label-51: SELECT 'a' IN t7n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-51",
      sql: "SELECT 'a' IN t7n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 860,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 859,
        },
      ],
    })
  })
  test("#165 query I nosort label-51: SELECT 'a' IN (SELECT * FROM t7n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-51",
      sql: "SELECT 'a' IN (SELECT * FROM t7n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 865,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#166 query I nosort label-52: SELECT 'e' NOT IN t7n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-52",
      sql: "SELECT 'e' NOT IN t7n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 871,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 870,
        },
      ],
    })
  })
  test("#167 query I nosort label-52: SELECT 'e' NOT IN (SELECT * FROM t7n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-52",
      sql: "SELECT 'e' NOT IN (SELECT * FROM t7n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 876,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#168 query I nosort label-53: SELECT 'f' IN t8n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-53",
      sql: "SELECT 'f' IN t8n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 882,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 881,
        },
      ],
    })
  })
  test("#169 query I nosort label-53: SELECT 'f' IN (SELECT * FROM t8n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-53",
      sql: "SELECT 'f' IN (SELECT * FROM t8n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 887,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#170 query I nosort label-54: SELECT 'g' NOT IN t8n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-54",
      sql: "SELECT 'g' NOT IN t8n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 893,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 892,
        },
      ],
    })
  })
  test("#171 query I nosort label-54: SELECT 'g' NOT IN (SELECT * FROM t8n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-54",
      sql: "SELECT 'g' NOT IN (SELECT * FROM t8n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 898,
      conditions: [],
    })
  })
  test("#172 query I nosort: SELECT null IN (2,3,4,null)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null IN (2,3,4,null)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 905,
      conditions: [],
    })
  })
  test("#173 query I nosort: SELECT null NOT IN (2,3,4,null)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null NOT IN (2,3,4,null)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 910,
      conditions: [],
    })
  })
  test("#174 query I nosort: SELECT null IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 915,
      conditions: [],
    })
  })
  test("#175 query I nosort: SELECT null NOT IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null NOT IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 920,
      conditions: [],
    })
  })
  test("#176 query I nosort: SELECT null IN ('b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null IN ('b','c','d')",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 925,
      conditions: [],
    })
  })
  test("#177 query I nosort: SELECT null NOT IN ('b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null NOT IN ('b','c','d')",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 930,
      conditions: [],
    })
  })
  test("#178 query I nosort: SELECT null IN ('b','c',null,'d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null IN ('b','c',null,'d')",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 935,
      conditions: [],
    })
  })
  test("#179 query I nosort: SELECT null NOT IN (null,'b','c','d')", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT null NOT IN (null,'b','c','d')",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 940,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#180 query I nosort label-55: SELECT null IN t4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-55",
      sql: "SELECT null IN t4",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 946,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 945,
        },
      ],
    })
  })
  // skipif mysql
  test("#181 query I nosort label-55: SELECT null IN (SELECT * FROM t4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-55",
      sql: "SELECT null IN (SELECT * FROM t4)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 953,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 952,
        },
      ],
    })
  })
  test("#182 query I nosort label-55: SELECT null IN (2,3,4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-55",
      sql: "SELECT null IN (2,3,4)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 959,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#183 query I nosort label-56: SELECT null NOT IN t4", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-56",
      sql: "SELECT null NOT IN t4",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 965,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 964,
        },
      ],
    })
  })
  // skipif mysql
  test("#184 query I nosort label-56: SELECT null NOT IN (SELECT * FROM t4)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-56",
      sql: "SELECT null NOT IN (SELECT * FROM t4)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 972,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 971,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#185 query I nosort label-57: SELECT null IN t4n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-57",
      sql: "SELECT null IN t4n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 978,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 977,
        },
      ],
    })
  })
  test("#186 query I nosort label-57: SELECT null IN (SELECT * FROM t4n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-57",
      sql: "SELECT null IN (SELECT * FROM t4n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 983,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#187 query I nosort label-58: SELECT null NOT IN t4n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-58",
      sql: "SELECT null NOT IN t4n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 989,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 988,
        },
      ],
    })
  })
  test("#188 query I nosort label-58: SELECT null NOT IN (SELECT * FROM t4n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-58",
      sql: "SELECT null NOT IN (SELECT * FROM t4n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 994,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#189 query I nosort label-59: SELECT null IN t5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-59",
      sql: "SELECT null IN t5",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1000,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 999,
        },
      ],
    })
  })
  // skipif mysql
  test("#190 query I nosort label-59: SELECT null IN (SELECT * FROM t5)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-59",
      sql: "SELECT null IN (SELECT * FROM t5)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1007,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 1006,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#191 query I nosort label-60: SELECT null NOT IN t5", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-60",
      sql: "SELECT null NOT IN t5",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1013,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1012,
        },
      ],
    })
  })
  // skipif mysql
  test("#192 query I nosort label-60: SELECT null NOT IN (SELECT * FROM t5)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-60",
      sql: "SELECT null NOT IN (SELECT * FROM t5)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1020,
      conditions: [
        {
          kind: "skipif",
          engine: "mysql",
          line: 1019,
        },
      ],
    })
  })
  // onlyif sqlite
  test("#193 query I nosort label-61: SELECT null IN t6", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-61",
      sql: "SELECT null IN t6",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1026,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1025,
        },
      ],
    })
  })
  test("#194 query I nosort label-61: SELECT null IN (SELECT * FROM t6)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-61",
      sql: "SELECT null IN (SELECT * FROM t6)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1031,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#195 query I nosort label-62: SELECT null NOT IN t6", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-62",
      sql: "SELECT null NOT IN t6",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1037,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1036,
        },
      ],
    })
  })
  test("#196 query I nosort label-62: SELECT null NOT IN (SELECT * FROM t6)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-62",
      sql: "SELECT null NOT IN (SELECT * FROM t6)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1042,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#197 query I nosort label-63: SELECT null IN t6n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-63",
      sql: "SELECT null IN t6n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1048,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1047,
        },
      ],
    })
  })
  test("#198 query I nosort label-63: SELECT null IN (SELECT * FROM t6n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-63",
      sql: "SELECT null IN (SELECT * FROM t6n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1053,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#199 query I nosort label-64: SELECT null NOT IN t6n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-64",
      sql: "SELECT null NOT IN t6n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1059,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1058,
        },
      ],
    })
  })
  test("#200 query I nosort label-64: SELECT null NOT IN (SELECT * FROM t6n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-64",
      sql: "SELECT null NOT IN (SELECT * FROM t6n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1064,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#201 query I nosort label-65: SELECT null IN t7", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-65",
      sql: "SELECT null IN t7",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1070,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1069,
        },
      ],
    })
  })
  test("#202 query I nosort label-65: SELECT null IN (SELECT * FROM t7)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-65",
      sql: "SELECT null IN (SELECT * FROM t7)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1075,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#203 query I nosort label-66: SELECT null NOT IN t7", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-66",
      sql: "SELECT null NOT IN t7",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1081,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1080,
        },
      ],
    })
  })
  test("#204 query I nosort label-66: SELECT null NOT IN (SELECT * FROM t7)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-66",
      sql: "SELECT null NOT IN (SELECT * FROM t7)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1086,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#205 query I nosort label-67: SELECT null IN t7n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-67",
      sql: "SELECT null IN t7n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1092,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1091,
        },
      ],
    })
  })
  test("#206 query I nosort label-67: SELECT null IN (SELECT * FROM t7n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-67",
      sql: "SELECT null IN (SELECT * FROM t7n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1097,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#207 query I nosort label-68: SELECT null NOT IN t7n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-68",
      sql: "SELECT null NOT IN t7n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1103,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1102,
        },
      ],
    })
  })
  test("#208 query I nosort label-68: SELECT null NOT IN (SELECT * FROM t7n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-68",
      sql: "SELECT null NOT IN (SELECT * FROM t7n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1108,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#209 query I nosort label-69: SELECT null IN t8", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-69",
      sql: "SELECT null IN t8",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1114,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1113,
        },
      ],
    })
  })
  test("#210 query I nosort label-69: SELECT null IN (SELECT * FROM t8)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-69",
      sql: "SELECT null IN (SELECT * FROM t8)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1119,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#211 query I nosort label-70: SELECT null NOT IN t8", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-70",
      sql: "SELECT null NOT IN t8",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1125,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1124,
        },
      ],
    })
  })
  test("#212 query I nosort label-70: SELECT null NOT IN (SELECT * FROM t8)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-70",
      sql: "SELECT null NOT IN (SELECT * FROM t8)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1130,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#213 query I nosort label-71: SELECT null IN t8n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-71",
      sql: "SELECT null IN t8n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1136,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1135,
        },
      ],
    })
  })
  test("#214 query I nosort label-71: SELECT null IN (SELECT * FROM t8n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-71",
      sql: "SELECT null IN (SELECT * FROM t8n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1141,
      conditions: [],
    })
  })
  // onlyif sqlite
  test("#215 query I nosort label-72: SELECT null NOT IN t8n", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-72",
      sql: "SELECT null NOT IN t8n",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1147,
      conditions: [
        {
          kind: "onlyif",
          engine: "sqlite",
          line: 1146,
        },
      ],
    })
  })
  test("#216 query I nosort label-72: SELECT null NOT IN (SELECT * FROM t8n)", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-72",
      sql: "SELECT null NOT IN (SELECT * FROM t8n)",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 1152,
      conditions: [],
    })
  })
})
