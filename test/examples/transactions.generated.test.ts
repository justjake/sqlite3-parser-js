// Generated from test/examples/transactions.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/transactions.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: BEGIN TRANSACTION tx1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "BEGIN TRANSACTION tx1",
      line: 7,
      conditions: [],
    })
  })
  test("#2 statement ok: COMMIT TRANSACTION tx1", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "COMMIT TRANSACTION tx1",
      line: 10,
      conditions: [],
    })
  })
  test("#3 statement ok: BEGIN TRANSACTION tx2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "BEGIN TRANSACTION tx2",
      line: 13,
      conditions: [],
    })
  })
  test("#4 statement ok: ROLLBACK TRANSACTION tx2", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "ROLLBACK TRANSACTION tx2",
      line: 16,
      conditions: [],
    })
  })
  test("#5 statement ok: BEGIN DEFERRED TRANSACTION", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "BEGIN DEFERRED TRANSACTION",
      line: 20,
      conditions: [],
    })
  })
  test("#6 statement ok: COMMIT", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "COMMIT",
      line: 23,
      conditions: [],
    })
  })
  test("#7 statement ok: BEGIN IMMEDIATE TRANSACTION", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "BEGIN IMMEDIATE TRANSACTION",
      line: 27,
      conditions: [],
    })
  })
  test("#8 statement ok: COMMIT", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "COMMIT",
      line: 30,
      conditions: [],
    })
  })
  test("#9 statement ok: BEGIN EXCLUSIVE TRANSACTION", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "BEGIN EXCLUSIVE TRANSACTION",
      line: 34,
      conditions: [],
    })
  })
  test("#10 statement ok: COMMIT", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "COMMIT",
      line: 37,
      conditions: [],
    })
  })
})
