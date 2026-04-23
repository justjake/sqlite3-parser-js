import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import test from "node:test"

test("main entrypoint parses SQL", async () => {
  const pkg = await import("sqlite3-parser")
  const result = pkg.parse("SELECT 1")

  assert.equal(result.status, "ok")
  assert.equal(result.root.type, "CmdList")
  assert.match(pkg.SQLITE_VERSION, /^\d+\.\d+\.\d+$/)
  assert.equal(typeof pkg.withOptions, "function")
  assert.equal(typeof pkg.createEngine, "function")
  assert.equal("createParser" in pkg, false)
  assert.equal("createTokenizer" in pkg, false)
  assert.equal("SQLITE_LIB" in pkg, false)
})

test("versioned subpath import works", async () => {
  const main = await import("sqlite3-parser")
  const pinned = await import(`sqlite3-parser/sqlite-${main.SQLITE_VERSION}`)
  const result = pinned.parse("SELECT 1")

  assert.equal(result.status, "ok")
  assert.equal(result.root.type, "CmdList")
  assert.equal(pinned.SQLITE_VERSION, main.SQLITE_VERSION)
})

test("main entrypoint can be imported from commonjs", () => {
  const output = execFileSync(process.execPath, [join(process.cwd(), "require-smoke.cjs")], {
    encoding: "utf8",
  })
  const result = JSON.parse(output)

  assert.equal(result.status, "ok")
  assert.equal(result.astKind, "CmdList")
  assert.match(result.version, /^\d+\.\d+\.\d+$/)
  assert.equal(result.withOptions, true)
  assert.equal(result.createEngine, true)
  assert.deepEqual(result.legacy, {
    createParser: false,
    createTokenizer: false,
    sqliteLib: false,
  })
  assert.deepEqual(result.tokenNames, ["SELECT", "QNUMBER"])
  assert.deepEqual(result.traverseKinds, [
    "CmdList",
    "SelectStmt",
    "Select",
    "SelectFrom",
    "ExprResultColumn",
    "NumericLiteral",
  ])
})

test("withOptions exposes a specialized parser module", async () => {
  const pkg = await import("sqlite3-parser")
  const mod = pkg.withOptions({ digitSeparator: "_" })
  const tokens = Array.from(mod.tokenize("SELECT 1_000"))

  assert.deepEqual(
    tokens.map((token) => mod.tokenName(token.type)),
    ["SELECT", "QNUMBER"],
  )
})

test("traverse is re-exported from the main entry", async () => {
  const pkg = await import("sqlite3-parser")
  const result = pkg.parse("SELECT 1")

  assert.equal(result.status, "ok")
  assert.equal(typeof pkg.traverse, "function")
  assert.equal(typeof pkg.VisitorKeys, "object")
  assert.deepEqual(Object.keys(pkg.VisitorKeys).slice(0, 3), [
    "CmdList",
    "AlterTableStmt",
    "AnalyzeStmt",
  ])

  const kinds = []
  pkg.traverse(result.root, {
    enter(node) {
      kinds.push(node.type)
    },
  })

  assert.deepEqual(kinds, [
    "CmdList",
    "SelectStmt",
    "Select",
    "SelectFrom",
    "ExprResultColumn",
    "NumericLiteral",
  ])
})

test("parser CLI runs under node", () => {
  const cli = join(
    process.cwd(),
    "node_modules",
    "sqlite3-parser",
    "dist",
    "bin",
    "sqlite3-parser.js",
  )
  const output = execFileSync(process.execPath, [cli, "SELECT 1"], {
    encoding: "utf8",
  })

  assert.match(output, /"type": "CmdList"/)
})

test("sqllogictest subpath exposes parseTest + driver", async () => {
  const slt = await import("sqlite3-parser/sqllogictest")
  const source = "statement ok\nSELECT 1\n\nquery I nosort\nSELECT 2\n----\n2\n"
  const result = slt.parseTest({ source, filename: "<inline>" })

  assert.equal(result.errors.length, 0)
  const stmts = result.records.filter((r) => r.type === "statement")
  const queries = result.records.filter((r) => r.type === "query")
  assert.equal(stmts.length, 1)
  assert.equal(stmts[0].sql, "SELECT 1")
  assert.equal(queries.length, 1)
  assert.equal(queries[0].sql, "SELECT 2")
  assert.equal(typeof slt.SQLite3ParserTestDriver.setup, "function")
})

test("sqllogictest-parser CLI runs under node", () => {
  const cli = join(
    process.cwd(),
    "node_modules",
    "sqlite3-parser",
    "dist",
    "bin",
    "sqllogictest-parser.js",
  )
  const output = execFileSync(process.execPath, [cli, "-"], {
    encoding: "utf8",
    input: "statement ok\nSELECT 1\n\nquery I nosort\nSELECT 2\n----\n2\n",
  })
  const records = JSON.parse(output)

  assert.ok(Array.isArray(records))
  const stmt = records.find((r) => r.type === "statement")
  const query = records.find((r) => r.type === "query")
  assert.equal(stmt.sql, "SELECT 1")
  assert.equal(query.sql, "SELECT 2")
})

test("tokenizer CLI runs under node", () => {
  const cli = join(
    process.cwd(),
    "node_modules",
    "sqlite3-parser",
    "dist",
    "bin",
    "sqlite3-tokenizer.js",
  )
  const output = execFileSync(process.execPath, [cli, "SELECT 1"], {
    encoding: "utf8",
  })
  const lines = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))

  assert.deepEqual(
    lines.map((line) => line.name),
    ["SELECT", "INTEGER"],
  )
})
