// Generated from test/examples/create-table.sqllogictest
// by bin/sqllogictest-parser. Do not edit by hand.

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SQLite3ParserTestDriver } from "../../src/sqllogictest/public.ts"

describe("test/examples/create-table.sqllogictest", () => {
  const driver = SQLite3ParserTestDriver.setup({ describe, test, expect, beforeEach, afterEach })

  // hash-threshold 8
  test("#1 statement ok: CREATE TABLE to1(a INTEGER PRIMARY KEY) WITHOUT ROWID, STRI…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE to1(a INTEGER PRIMARY KEY) WITHOUT ROWID, STRICT",
      line: 13,
      conditions: [],
    })
  })
  test("#2 statement ok: CREATE TABLE to2(a INTEGER) STRICT", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE to2(a INTEGER) STRICT",
      line: 16,
      conditions: [],
    })
  })
  test("#3 statement ok: CREATE TABLE notype(a, b, c)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE notype(a, b, c)",
      line: 20,
      conditions: [],
    })
  })
  test("#4 statement ok: CREATE TABLE types1( a DECIMAL(10, 2), b NUMERIC(+5, -2), c…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE types1(\n  a DECIMAL(10, 2),\n  b NUMERIC(+5, -2),\n  c UNSIGNED BIG INT\n)",
      line: 27,
      conditions: [],
    })
  })
  test("#5 statement ok: CREATE TABLE ct1( a INTEGER CONSTRAINT pk_a PRIMARY KEY, b…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE ct1(\n  a INTEGER CONSTRAINT pk_a PRIMARY KEY,\n  b INTEGER NOT NULL DEFAULT 0,\n  c INTEGER CONSTRAINT c_null NULL ON CONFLICT IGNORE,\n  d TEXT COLLATE NOCASE\n)",
      line: 38,
      conditions: [],
    })
  })
  test("#6 statement ok: CREATE TABLE ct2( a INTEGER DEFAULT (1 + 2), b INTEGER DEFA…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE ct2(\n  a INTEGER DEFAULT (1 + 2),\n  b INTEGER DEFAULT +5,\n  c INTEGER DEFAULT -5\n)",
      line: 49,
      conditions: [],
    })
  })
  test("#7 statement ok: CREATE TABLE ct3( a INTEGER CHECK (a > 0) )", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE ct3(\n  a INTEGER CHECK (a > 0)\n)",
      line: 57,
      conditions: [],
    })
  })
  test("#8 statement ok: CREATE TABLE parent(id INTEGER PRIMARY KEY)", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE parent(id INTEGER PRIMARY KEY)",
      line: 70,
      conditions: [],
    })
  })
  test("#9 statement ok: CREATE TABLE fk1( x INTEGER REFERENCES parent(id) MATCH FUL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE fk1(\n  x INTEGER REFERENCES parent(id)\n    MATCH FULL\n    ON INSERT SET NULL\n    ON UPDATE SET DEFAULT\n    ON DELETE RESTRICT\n)",
      line: 73,
      conditions: [],
    })
  })
  test("#10 statement ok: CREATE TABLE fk2( x INTEGER REFERENCES parent(id) ON DELETE…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE fk2(\n  x INTEGER REFERENCES parent(id) ON DELETE NO ACTION\n)",
      line: 82,
      conditions: [],
    })
  })
  test("#11 statement ok: CREATE TABLE fk3( x INTEGER REFERENCES parent(id) NOT DEFER…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE fk3(\n  x INTEGER REFERENCES parent(id) NOT DEFERRABLE\n)",
      line: 93,
      conditions: [],
    })
  })
  test("#12 statement ok: CREATE TABLE fk4( x INTEGER REFERENCES parent(id) DEFERRABL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE fk4(\n  x INTEGER REFERENCES parent(id) DEFERRABLE\n)",
      line: 98,
      conditions: [],
    })
  })
  test("#13 statement ok: CREATE TABLE fk5( x INTEGER REFERENCES parent(id) DEFERRABL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE fk5(\n  x INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED\n)",
      line: 103,
      conditions: [],
    })
  })
  test("#14 statement ok: CREATE TABLE fk6( x INTEGER REFERENCES parent(id) DEFERRABL…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE fk6(\n  x INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY IMMEDIATE\n)",
      line: 108,
      conditions: [],
    })
  })
  test("#15 statement ok: CREATE TABLE gen1( a INTEGER, b INTEGER GENERATED ALWAYS AS…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE gen1(\n  a INTEGER,\n  b INTEGER GENERATED ALWAYS AS (a + 1),\n  c INTEGER AS (a * 2),\n  d INTEGER AS (a - 1) STORED,\n  e INTEGER GENERATED ALWAYS AS (a + 5) VIRTUAL\n)",
      line: 117,
      conditions: [],
    })
  })
  test("#16 statement ok: CREATE TABLE ai1( a INTEGER PRIMARY KEY AUTOINCREMENT, b TE…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE ai1(\n  a INTEGER PRIMARY KEY AUTOINCREMENT,\n  b TEXT\n)",
      line: 127,
      conditions: [],
    })
  })
  test("#17 statement ok: CREATE TABLE tc1( a INTEGER, b INTEGER, CONSTRAINT pk PRIMA…", () => {
    driver.runRecord({
      type: "statement",
      expect: "ok",
      sql: "CREATE TABLE tc1(\n  a INTEGER,\n  b INTEGER,\n  CONSTRAINT pk PRIMARY KEY (a, b) ON CONFLICT IGNORE,\n  CONSTRAINT chk1 CHECK (a > 0) ON CONFLICT ROLLBACK,\n  FOREIGN KEY (a) REFERENCES parent(id) NOT DEFERRABLE\n)",
      line: 141,
      conditions: [],
    })
  })
})
