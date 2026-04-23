// Generated from test/examples/create-vtab.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/create-vtab.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE VIRTUAL TABLE vt1 USING fts5", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIRTUAL TABLE vt1 USING fts5",
      line: 8,
      conditions: [],
    })
  })
  test("#2 statement ok: CREATE VIRTUAL TABLE vt2 USING fts5(content, tokenize = 'po…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIRTUAL TABLE vt2 USING fts5(content, tokenize = 'porter unicode61')",
      line: 15,
      conditions: [],
    })
  })
  test("#3 statement ok: CREATE VIRTUAL TABLE vt3 USING rtree(id, minX, maxX, minY,…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIRTUAL TABLE vt3 USING rtree(id, minX, maxX, minY, maxY)",
      line: 19,
      conditions: [],
    })
  })
  test('#4 statement ok: CREATE VIRTUAL TABLE vt4 USING fts5( body, tokenize = "port…', () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIRTUAL TABLE vt4 USING fts5(\n  body,\n  tokenize = \"porter unicode61 remove_diacritics 2\",\n  content = 't1',\n  prefix = '2 3'\n)",
      line: 22,
      conditions: [],
    })
  })
  test("#5 statement ok: CREATE VIRTUAL TABLE vt5 USING mymod(a (b (c d) e) f)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE VIRTUAL TABLE vt5 USING mymod(a (b (c d) e) f)",
      line: 31,
      conditions: [],
    })
  })
})
