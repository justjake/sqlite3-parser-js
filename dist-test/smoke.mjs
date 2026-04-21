import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import test from "node:test"

test("main entrypoint parses SQL", async () => {
  const pkg = await import("sqlite3-parser")
  const result = pkg.parse("SELECT 1")

  assert.equal(result.status, "accepted")
  assert.equal(result.ast.kind, "CmdList")
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

  assert.equal(result.status, "accepted")
  assert.equal(result.ast.kind, "CmdList")
  assert.equal(pinned.SQLITE_VERSION, main.SQLITE_VERSION)
})

test("main entrypoint can be imported from commonjs", () => {
  const output = execFileSync(process.execPath, [join(process.cwd(), "require-smoke.cjs")], {
    encoding: "utf8",
  })
  const result = JSON.parse(output)

  assert.equal(result.status, "accepted")
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

test("traverse subpath import works", async () => {
  const pkg = await import("sqlite3-parser")
  const traversePkg = await import("sqlite3-parser/traverse")
  const result = pkg.parse("SELECT 1")

  assert.equal(result.status, "accepted")
  assert.equal(typeof traversePkg.traverse, "function")
  assert.equal(typeof traversePkg.VisitorKeys, "object")
  assert.deepEqual(Object.keys(traversePkg.VisitorKeys).slice(0, 3), [
    "CmdList",
    "AlterTableStmt",
    "AnalyzeStmt",
  ])

  const kinds = []
  traversePkg.traverse(result.ast, {
    enter(node) {
      kinds.push(node.kind)
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

  assert.match(output, /"kind": "CmdList"/)
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
