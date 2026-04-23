// Generated from test/examples/alter-table.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/alter-table.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE t1(a INTEGER, b INTEGER, CONSTRAINT c1 CHECK (…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE t1(a INTEGER, b INTEGER, CONSTRAINT c1 CHECK (a > 0))",
      line: 5,
      conditions: [],
    })
  })
  test("#2 statement ok: ALTER TABLE t1 DROP CONSTRAINT c1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 DROP CONSTRAINT c1",
      line: 9,
      conditions: [],
    })
  })
  test("#3 statement ok: ALTER TABLE t1 ALTER a DROP NOT NULL", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 ALTER a DROP NOT NULL",
      line: 14,
      conditions: [],
    })
  })
  test("#4 statement ok: ALTER TABLE t1 ALTER COLUMN a DROP NOT NULL", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 ALTER COLUMN a DROP NOT NULL",
      line: 17,
      conditions: [],
    })
  })
  test("#5 statement ok: ALTER TABLE t1 ALTER b SET NOT NULL", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 ALTER b SET NOT NULL",
      line: 21,
      conditions: [],
    })
  })
  test("#6 statement ok: ALTER TABLE t1 ALTER COLUMN b SET NOT NULL ON CONFLICT ROLL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 ALTER COLUMN b SET NOT NULL ON CONFLICT ROLLBACK",
      line: 24,
      conditions: [],
    })
  })
  test("#7 statement ok: ALTER TABLE t1 ADD CONSTRAINT c2 CHECK (b > 0) ON CONFLICT…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 ADD CONSTRAINT c2 CHECK (b > 0) ON CONFLICT ABORT",
      line: 28,
      conditions: [],
    })
  })
  test("#8 statement ok: ALTER TABLE t1 ADD CHECK (a + b > 0) ON CONFLICT FAIL", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ALTER TABLE t1 ADD CHECK (a + b > 0) ON CONFLICT FAIL",
      line: 32,
      conditions: [],
    })
  })
})
