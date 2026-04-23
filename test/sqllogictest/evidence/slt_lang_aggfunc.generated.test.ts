// Generated from vendor/submodule/sqllogictest/test/evidence/slt_lang_aggfunc.test
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "/Users/jitl/src/sqlite3-parser-js/src/sqllogictest/public.ts"

describe("vendor/submodule/sqllogictest/test/evidence/slt_lang_aggfunc.test", () => {
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
  // skipif sqlite
  // halt
  test("#6 query I nosort: SELECT count(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["2"],
      },
      line: 28,
      conditions: [],
    })
  })
  test("#7 query I nosort: SELECT avg(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT avg(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 33,
      conditions: [],
    })
  })
  test("#8 query I nosort: SELECT sum(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT sum(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 38,
      conditions: [],
    })
  })
  test("#9 query I nosort: SELECT total(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT total(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 43,
      conditions: [],
    })
  })
  test("#10 query I nosort: SELECT min(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT min(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 48,
      conditions: [],
    })
  })
  test("#11 query I nosort: SELECT max(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT max(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 53,
      conditions: [],
    })
  })
  test("#12 query T nosort: SELECT group_concat(DISTINCT x) FROM t1 NOT INDEXED", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(DISTINCT x) FROM t1 NOT INDEXED",
      expected: {
        kind: "values",
        values: ["1,0"],
      },
      line: 58,
      conditions: [],
    })
  })
  test("#13 statement ok: INSERT INTO t1 VALUES(2,'true')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(2,'true')",
      line: 71,
      conditions: [],
    })
  })
  test("#14 statement ok: INSERT INTO t1 VALUES(2,'true')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(2,'true')",
      line: 74,
      conditions: [],
    })
  })
  test("#15 query I nosort: SELECT count(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 77,
      conditions: [],
    })
  })
  test("#16 query I nosort: SELECT avg(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT avg(x) FROM t1",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 86,
      conditions: [],
    })
  })
  test("#17 query I nosort: SELECT count(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(y) FROM t1",
      expected: {
        kind: "values",
        values: ["5"],
      },
      line: 95,
      conditions: [],
    })
  })
  test("#18 query I nosort: SELECT avg(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT avg(y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 100,
      conditions: [],
    })
  })
  test("#19 query I nosort: SELECT sum(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT sum(y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 105,
      conditions: [],
    })
  })
  test("#20 query I nosort: SELECT total(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT total(y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 110,
      conditions: [],
    })
  })
  test("#21 query I nosort: SELECT min(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT min(y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 115,
      conditions: [],
    })
  })
  test("#22 query I nosort: SELECT max(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT max(y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 120,
      conditions: [],
    })
  })
  test("#23 query T nosort: SELECT group_concat(y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(y) FROM t1",
      expected: {
        kind: "values",
        values: ["true,false,NULL,true,true"],
      },
      line: 125,
      conditions: [],
    })
  })
  test("#24 query I nosort: SELECT count(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 132,
      conditions: [],
    })
  })
  test("#25 query I nosort: SELECT avg(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT avg(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 137,
      conditions: [],
    })
  })
  test("#26 query I nosort: SELECT sum(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT sum(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 142,
      conditions: [],
    })
  })
  test("#27 query I nosort: SELECT total(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT total(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 147,
      conditions: [],
    })
  })
  test("#28 query I nosort: SELECT min(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT min(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 152,
      conditions: [],
    })
  })
  test("#29 query I nosort: SELECT max(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT max(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 157,
      conditions: [],
    })
  })
  test("#30 query T nosort: SELECT group_concat(DISTINCT y) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(DISTINCT y) FROM t1",
      expected: {
        kind: "values",
        values: ["true,false,NULL"],
      },
      line: 162,
      conditions: [],
    })
  })
  test("#31 query R nosort: SELECT avg(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT avg(x) FROM t1",
      expected: {
        kind: "values",
        values: ["1.250"],
      },
      line: 173,
      conditions: [],
    })
  })
  test("#32 query R nosort: SELECT avg(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT avg(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["1.000"],
      },
      line: 178,
      conditions: [],
    })
  })
  test("#33 query I nosort label-NULL: SELECT avg(x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT avg(x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 187,
      conditions: [],
    })
  })
  test("#34 query I nosort label-NULL: SELECT avg(DISTINCT x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT avg(DISTINCT x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 192,
      conditions: [],
    })
  })
  test("#35 query I nosort: SELECT count(x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 201,
      conditions: [],
    })
  })
  test("#36 query I nosort: SELECT count(DISTINCT x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(DISTINCT x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 206,
      conditions: [],
    })
  })
  test("#37 query I nosort: SELECT count(x) FROM t1 WHERE y='false'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(x) FROM t1 WHERE y='false'",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 211,
      conditions: [],
    })
  })
  test("#38 query I nosort: SELECT count(DISTINCT x) FROM t1 WHERE y='false'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(DISTINCT x) FROM t1 WHERE y='false'",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 216,
      conditions: [],
    })
  })
  test("#39 query I nosort: SELECT count(*) FROM t1 WHERE y='false'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT count(*) FROM t1 WHERE y='false'",
      expected: {
        kind: "values",
        values: ["1"],
      },
      line: 225,
      conditions: [],
    })
  })
  test("#40 statement error: SELECT count(DISTINCT *) FROM t1 WHERE y='false'", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "SELECT count(DISTINCT *) FROM t1 WHERE y='false'",
      line: 232,
      conditions: [],
    })
  })
  test("#41 query T nosort: SELECT group_concat(x) FROM t1 NOT INDEXED", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(x) FROM t1 NOT INDEXED",
      expected: {
        kind: "values",
        values: ["1,0,2,2"],
      },
      line: 239,
      conditions: [],
    })
  })
  test("#42 query T nosort: SELECT group_concat(DISTINCT x) FROM t1 NOT INDEXED", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(DISTINCT x) FROM t1 NOT INDEXED",
      expected: {
        kind: "values",
        values: ["1,0,2"],
      },
      line: 244,
      conditions: [],
    })
  })
  test("#43 query T nosort: SELECT group_concat(x,':') FROM t1 NOT INDEXED", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(x,':') FROM t1 NOT INDEXED",
      expected: {
        kind: "values",
        values: ["1:0:2:2"],
      },
      line: 253,
      conditions: [],
    })
  })
  test("#44 statement error: SELECT group_concat(DISTINCT x,':') FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "error",
      sql: "SELECT group_concat(DISTINCT x,':') FROM t1",
      line: 259,
      conditions: [],
    })
  })
  test("#45 query T nosort: SELECT group_concat(x) FROM t1 NOT INDEXED", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(x) FROM t1 NOT INDEXED",
      expected: {
        kind: "values",
        values: ["1,0,2,2"],
      },
      line: 266,
      conditions: [],
    })
  })
  test("#46 query T nosort: SELECT group_concat(DISTINCT x) FROM t1 NOT INDEXED", () => {
    driver.runRecord({
      type: "query",
      types: "T",
      sort: "nosort",
      sql: "SELECT group_concat(DISTINCT x) FROM t1 NOT INDEXED",
      expected: {
        kind: "values",
        values: ["1,0,2"],
      },
      line: 271,
      conditions: [],
    })
  })
  test("#47 query I nosort: SELECT max(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT max(x) FROM t1",
      expected: {
        kind: "values",
        values: ["2"],
      },
      line: 280,
      conditions: [],
    })
  })
  test("#48 query I nosort: SELECT max(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT max(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["2"],
      },
      line: 285,
      conditions: [],
    })
  })
  test("#49 query I nosort: SELECT x FROM t1 WHERE x NOT NULL ORDER BY x", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT x FROM t1 WHERE x NOT NULL ORDER BY x",
      expected: {
        kind: "values",
        values: ["0", "1", "2", "2"],
      },
      line: 295,
      conditions: [],
    })
  })
  test("#50 query I nosort: SELECT DISTINCT x FROM t1 WHERE x NOT NULL ORDER BY x", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT DISTINCT x FROM t1 WHERE x NOT NULL ORDER BY x",
      expected: {
        kind: "values",
        values: ["0", "1", "2"],
      },
      line: 303,
      conditions: [],
    })
  })
  test("#51 query I nosort label-NULL: SELECT max(x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT max(x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 314,
      conditions: [],
    })
  })
  test("#52 query I nosort label-NULL: SELECT max(DISTINCT x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT max(DISTINCT x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 319,
      conditions: [],
    })
  })
  test("#53 query I nosort: SELECT min(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT min(x) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 328,
      conditions: [],
    })
  })
  test("#54 query I nosort: SELECT min(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT min(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 333,
      conditions: [],
    })
  })
  test("#55 query I nosort: SELECT x FROM t1 WHERE x NOT NULL ORDER BY x", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT x FROM t1 WHERE x NOT NULL ORDER BY x",
      expected: {
        kind: "values",
        values: ["0", "1", "2", "2"],
      },
      line: 342,
      conditions: [],
    })
  })
  test("#56 query I nosort: SELECT DISTINCT x FROM t1 WHERE x NOT NULL ORDER BY x", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      sql: "SELECT DISTINCT x FROM t1 WHERE x NOT NULL ORDER BY x",
      expected: {
        kind: "values",
        values: ["0", "1", "2"],
      },
      line: 350,
      conditions: [],
    })
  })
  test("#57 query I nosort label-NULL: SELECT min(x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT min(x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 361,
      conditions: [],
    })
  })
  test("#58 query I nosort label-NULL: SELECT min(DISTINCT x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT min(DISTINCT x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 366,
      conditions: [],
    })
  })
  test("#59 query I nosort label-sum: SELECT sum(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-sum",
      sql: "SELECT sum(x) FROM t1",
      expected: {
        kind: "values",
        values: ["5"],
      },
      line: 375,
      conditions: [],
    })
  })
  test("#60 query I nosort label-sum: SELECT total(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-sum",
      sql: "SELECT total(x) FROM t1",
      expected: {
        kind: "values",
        values: ["5"],
      },
      line: 380,
      conditions: [],
    })
  })
  test("#61 query I nosort label-sum-distinct: SELECT sum(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-sum-distinct",
      sql: "SELECT sum(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 385,
      conditions: [],
    })
  })
  test("#62 query I nosort label-sum-distinct: SELECT total(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-sum-distinct",
      sql: "SELECT total(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 390,
      conditions: [],
    })
  })
  test("#63 query I nosort label-NULL: SELECT sum(x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT sum(x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 399,
      conditions: [],
    })
  })
  test("#64 query I nosort label-NULL: SELECT sum(DISTINCT x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-NULL",
      sql: "SELECT sum(DISTINCT x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["NULL"],
      },
      line: 404,
      conditions: [],
    })
  })
  test("#65 query I nosort label-zero: SELECT total(x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-zero",
      sql: "SELECT total(x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 409,
      conditions: [],
    })
  })
  test("#66 query I nosort label-zero: SELECT total(DISTINCT x) FROM t1 WHERE y='null'", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-zero",
      sql: "SELECT total(DISTINCT x) FROM t1 WHERE y='null'",
      expected: {
        kind: "values",
        values: ["0"],
      },
      line: 414,
      conditions: [],
    })
  })
  test("#67 query R nosort: SELECT total(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT total(x) FROM t1",
      expected: {
        kind: "values",
        values: ["5.000"],
      },
      line: 423,
      conditions: [],
    })
  })
  test("#68 query R nosort: SELECT total(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT total(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["3.000"],
      },
      line: 428,
      conditions: [],
    })
  })
  test("#69 query I nosort label-sum: SELECT sum(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-sum",
      sql: "SELECT sum(x) FROM t1",
      expected: {
        kind: "values",
        values: ["5"],
      },
      line: 437,
      conditions: [],
    })
  })
  test("#70 query I nosort label-sum-distinct: SELECT sum(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "I",
      sort: "nosort",
      label: "label-sum-distinct",
      sql: "SELECT sum(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["3"],
      },
      line: 442,
      conditions: [],
    })
  })
  test("#71 statement ok: INSERT INTO t1 VALUES(4.0,'true')", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(4.0,'true')",
      line: 452,
      conditions: [],
    })
  })
  test("#72 query R nosort: SELECT sum(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT sum(x) FROM t1",
      expected: {
        kind: "values",
        values: ["9.000"],
      },
      line: 455,
      conditions: [],
    })
  })
  test("#73 query R nosort: SELECT sum(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT sum(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["7.000"],
      },
      line: 460,
      conditions: [],
    })
  })
  test("#74 statement ok: INSERT INTO t1 VALUES(1<<63,'true');", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(1<<63,'true');",
      line: 470,
      conditions: [],
    })
  })
  test("#75 statement ok: INSERT INTO t1 VALUES(1<<63,'true');", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(1<<63,'true');",
      line: 473,
      conditions: [],
    })
  })
  test("#76 statement ok: INSERT INTO t1 VALUES(-1,'true'); DROP INDEX t1i1;", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "INSERT INTO t1 VALUES(-1,'true');\nDROP INDEX t1i1;",
      line: 476,
      conditions: [],
    })
  })
  test("#77 query R nosort: SELECT sum(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT sum(x) FROM t1",
      expected: {
        kind: "values",
        values: [],
      },
      line: 480,
      conditions: [],
    })
  })
  test("#78 query R nosort: SELECT sum(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT sum(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["-9223372036854776000.000"],
      },
      line: 484,
      conditions: [],
    })
  })
  test("#79 query R nosort: SELECT total(x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT total(x) FROM t1",
      expected: {
        kind: "values",
        values: ["-18446744073709550000.000"],
      },
      line: 491,
      conditions: [],
    })
  })
  test("#80 query R nosort: SELECT total(DISTINCT x) FROM t1", () => {
    driver.runRecord({
      type: "query",
      types: "R",
      sort: "nosort",
      sql: "SELECT total(DISTINCT x) FROM t1",
      expected: {
        kind: "values",
        values: ["-9223372036854776000.000"],
      },
      line: 496,
      conditions: [],
    })
  })
})
