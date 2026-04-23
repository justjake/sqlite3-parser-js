// Generated from test/examples/trigger.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/trigger.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER PRIMARY KEY, b INTEGER, c INTEGER)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER PRIMARY KEY, b INTEGER, c INTEGER)",
      line: 9,
      conditions: [],
    })
  })
  test("#2 statement ok: CREATE TABLE log(ts TEXT, msg TEXT)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE log(ts TEXT, msg TEXT)",
      line: 12,
      conditions: [],
    })
  })
  test("#3 statement ok: CREATE VIEW v1 AS SELECT * FROM t1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIEW v1 AS SELECT * FROM t1",
      line: 15,
      conditions: [],
    })
  })
  test("#4 statement ok: CREATE TRIGGER tr_instead INSTEAD OF INSERT ON v1 FOR EACH…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_instead INSTEAD OF INSERT ON v1\nFOR EACH ROW\nWHEN new.a > 0\nBEGIN\n  INSERT INTO t1(a, b) VALUES (new.a, new.b);\n  INSERT INTO log(msg) SELECT 'inserted ' || new.a;\nEND",
      line: 24,
      conditions: [],
    })
  })
  test("#5 statement ok: CREATE TRIGGER tr_update_of AFTER UPDATE OF b, c ON t1 BEGI…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_update_of AFTER UPDATE OF b, c ON t1\nBEGIN\n  INSERT INTO log(msg) VALUES ('b or c changed');\nEND",
      line: 34,
      conditions: [],
    })
  })
  test("#6 statement ok: CREATE INDEX t1_b ON t1(b)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE INDEX t1_b ON t1(b)",
      line: 43,
      conditions: [],
    })
  })
  test("#7 statement ok: CREATE TRIGGER tr_del_indexed BEFORE INSERT ON t1 BEGIN DEL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_del_indexed BEFORE INSERT ON t1\nBEGIN\n  DELETE FROM t1 INDEXED BY t1_b WHERE b = new.b;\nEND",
      line: 46,
      conditions: [],
    })
  })
  test("#8 statement ok: CREATE TRIGGER tr_del_notindexed BEFORE INSERT ON t1 BEGIN…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_del_notindexed BEFORE INSERT ON t1\nBEGIN\n  DELETE FROM t1 NOT INDEXED WHERE b = new.b;\nEND",
      line: 52,
      conditions: [],
    })
  })
  test("#9 statement ok: CREATE TRIGGER tr_raise_rollback BEFORE INSERT ON t1 BEGIN…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_raise_rollback BEFORE INSERT ON t1\nBEGIN\n  SELECT RAISE(ROLLBACK, 'nope');\nEND",
      line: 60,
      conditions: [],
    })
  })
  test("#10 statement ok: CREATE TRIGGER tr_raise_fail BEFORE INSERT ON t1 BEGIN SELE…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_raise_fail BEFORE INSERT ON t1\nBEGIN\n  SELECT RAISE(FAIL, 'bad');\nEND",
      line: 66,
      conditions: [],
    })
  })
  test("#11 statement ok: CREATE TRIGGER tr_raise_abort BEFORE INSERT ON t1 BEGIN SEL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TRIGGER tr_raise_abort BEFORE INSERT ON t1\nBEGIN\n  SELECT RAISE(ABORT, 'abort');\nEND",
      line: 72,
      conditions: [],
    })
  })
})
