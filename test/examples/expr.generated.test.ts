// Generated from test/examples/expr.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/expr.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER, b INTEGER, c INTEGER, d TEXT, e…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER, b INTEGER, c INTEGER, d TEXT, e INTEGER)",
      line: 11,
      conditions: [],
    })
  })
  test("#2 statement ok: CREATE TABLE t2(x INTEGER, y INTEGER, g INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t2(x INTEGER, y INTEGER, g INTEGER)",
      line: 14,
      conditions: [],
    })
  })
  test("#3 statement ok: SELECT group_concat(d ORDER BY a DESC) FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT group_concat(d ORDER BY a DESC) FROM t1",
      line: 19,
      conditions: [],
    })
  })
  test("#4 statement ok: SELECT group_concat(DISTINCT d ORDER BY a) FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT group_concat(DISTINCT d ORDER BY a) FROM t1",
      line: 22,
      conditions: [],
    })
  })
  test("#5 statement ok: SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY a) FROM…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY a) FROM t1",
      line: 27,
      conditions: [],
    })
  })
  test("#6 statement ok: SELECT group_concat(d ORDER BY a) FILTER (WHERE a > 0) FROM…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT group_concat(d ORDER BY a) FILTER (WHERE a > 0) FROM t1",
      line: 32,
      conditions: [],
    })
  })
  test("#7 statement ok: SELECT group_concat(d ORDER BY a) OVER (PARTITION BY b) FRO…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT group_concat(d ORDER BY a) OVER (PARTITION BY b) FROM t1",
      line: 35,
      conditions: [],
    })
  })
  test("#8 statement ok: SELECT count(*) OVER (ORDER BY a) FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT count(*) OVER (ORDER BY a) FROM t1",
      line: 40,
      conditions: [],
    })
  })
  test("#9 statement ok: SELECT count(*) FILTER (WHERE a > 0) OVER (PARTITION BY b)…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT count(*) FILTER (WHERE a > 0) OVER (PARTITION BY b) FROM t1",
      line: 43,
      conditions: [],
    })
  })
  test("#10 statement ok: SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY a) OVER…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY a) OVER (PARTITION BY b) FROM t1",
      line: 48,
      conditions: [],
    })
  })
  test("#11 statement ok: SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY a) FILTE…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY a) FILTER (WHERE a > 0) FROM t1",
      line: 51,
      conditions: [],
    })
  })
  test("#12 statement ok: SELECT (1, 2, 3) FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT (1, 2, 3) FROM t1",
      line: 56,
      conditions: [],
    })
  })
  test("#13 statement ok: SELECT x FROM t1 WHERE (a, b) IN (SELECT x, y FROM t2)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT x FROM t1 WHERE (a, b) IN (SELECT x, y FROM t2)",
      line: 59,
      conditions: [],
    })
  })
  test("#14 statement ok: SELECT x FROM t1 WHERE (a, b) = (1, 2)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT x FROM t1 WHERE (a, b) = (1, 2)",
      line: 62,
      conditions: [],
    })
  })
  test("#15 statement ok: SELECT a FROM t1 WHERE d NOT LIKE '%abc%'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE d NOT LIKE '%abc%'",
      line: 67,
      conditions: [],
    })
  })
  test("#16 statement ok: SELECT a FROM t1 WHERE d NOT GLOB 'foo*'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE d NOT GLOB 'foo*'",
      line: 70,
      conditions: [],
    })
  })
  test("#17 statement ok: SELECT a FROM t1 WHERE d NOT REGEXP '[a-z]+'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE d NOT REGEXP '[a-z]+'",
      line: 73,
      conditions: [],
    })
  })
  test("#18 statement ok: SELECT a FROM t1 WHERE d NOT MATCH 'bar'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE d NOT MATCH 'bar'",
      line: 76,
      conditions: [],
    })
  })
  test("#19 statement ok: SELECT a FROM t1 WHERE a IS NOT DISTINCT FROM b", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE a IS NOT DISTINCT FROM b",
      line: 80,
      conditions: [],
    })
  })
  test("#20 statement ok: SELECT a FROM t1 WHERE a IS DISTINCT FROM b", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE a IS DISTINCT FROM b",
      line: 84,
      conditions: [],
    })
  })
  test("#21 statement ok: SELECT a FROM t1 WHERE a IN t2(x, y)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE a IN t2(x, y)",
      line: 90,
      conditions: [],
    })
  })
  test("#22 statement ok: SELECT a FROM t1 WHERE a NOT IN t2(x, y)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE a NOT IN t2(x, y)",
      line: 93,
      conditions: [],
    })
  })
  test("#23 statement ok: SELECT a FROM t1 ORDER BY d COLLATE NOCASE", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 ORDER BY d COLLATE NOCASE",
      line: 98,
      conditions: [],
    })
  })
  test("#24 statement ok: SELECT a FROM t1 WHERE d COLLATE BINARY = 'foo'", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE d COLLATE BINARY = 'foo'",
      line: 101,
      conditions: [],
    })
  })
  test("#25 statement ok: CREATE TRIGGER trig_ignore BEFORE INSERT ON t1 BEGIN SELECT…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER trig_ignore BEFORE INSERT ON t1\nBEGIN\n  SELECT RAISE(IGNORE);\nEND",
      line: 106,
      conditions: [],
    })
  })
  test('#26 statement ok: SELECT "123" FROM t1', () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: 'SELECT "123" FROM t1',
      line: 117,
      conditions: [],
    })
  })
  test("#27 statement ok: SELECT CURRENT_TIMESTAMP FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT CURRENT_TIMESTAMP FROM t1",
      line: 123,
      conditions: [],
    })
  })
  test("#28 statement ok: SELECT CURRENT_DATE, CURRENT_TIME FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT CURRENT_DATE, CURRENT_TIME FROM t1",
      line: 126,
      conditions: [],
    })
  })
  test("#29 statement ok: SELECT x'deadbeef' FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT x'deadbeef' FROM t1",
      line: 129,
      conditions: [],
    })
  })
  test("#30 statement ok: SELECT a FROM t1 WHERE a BETWEEN 1 AND 10", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE a BETWEEN 1 AND 10",
      line: 134,
      conditions: [],
    })
  })
  test("#31 statement ok: SELECT a FROM t1 WHERE a NOT BETWEEN 1 AND 10", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a FROM t1 WHERE a NOT BETWEEN 1 AND 10",
      line: 137,
      conditions: [],
    })
  })
  test("#32 statement ok: SELECT CASE WHEN a > 0 THEN 'pos' WHEN a < 0 THEN 'neg' ELS…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT CASE WHEN a > 0 THEN 'pos' WHEN a < 0 THEN 'neg' ELSE 'zero' END FROM t1",
      line: 140,
      conditions: [],
    })
  })
  test("#33 statement ok: SELECT CASE a WHEN 1 THEN 'one' WHEN 2 THEN 'two' END FROM…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT CASE a WHEN 1 THEN 'one' WHEN 2 THEN 'two' END FROM t1",
      line: 143,
      conditions: [],
    })
  })
  test("#34 statement ok: SELECT a || d FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a || d FROM t1",
      line: 146,
      conditions: [],
    })
  })
  test("#35 statement ok: SELECT a + b * c - d FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a + b * c - d FROM t1",
      line: 149,
      conditions: [],
    })
  })
  test("#36 statement ok: SELECT a & b | c << 2 >> 1 FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT a & b | c << 2 >> 1 FROM t1",
      line: 152,
      conditions: [],
    })
  })
  test("#37 statement ok: SELECT ~a FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT ~a FROM t1",
      line: 155,
      conditions: [],
    })
  })
  test("#38 statement ok: SELECT NOT a FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT NOT a FROM t1",
      line: 158,
      conditions: [],
    })
  })
  test("#39 statement ok: SELECT -a, +b FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "SELECT -a, +b FROM t1",
      line: 161,
      conditions: [],
    })
  })
})
