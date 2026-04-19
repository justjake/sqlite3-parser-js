import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

import * as sourcePkg from "../generated/current.ts"
import * as distPkg from "../dist/generated/current.js"

const ROOT = process.cwd()
const DIST_PARSER_CLI = join(ROOT, "dist", "bin", "sqlite3-parser.js")
const DIST_TOKENIZER_CLI = join(ROOT, "dist", "bin", "sqlite3-tokenizer.js")

const RUNTIME_EXPORTS = [
  "KEYWORD_DEFS",
  "PARSER_DEFS",
  "SQLITE_VERSION",
  "createEngine",
  "formatCst",
  "parse",
  "tokenLeaves",
  "tokenName",
  "tokenize",
  "walkCst",
  "withOptions",
].sort()

function runNodeCli(path: string, input: string, args: string[] = []) {
  return spawnSync("node", [path, ...args], {
    cwd: ROOT,
    input,
    encoding: "utf8",
  })
}

describe("generated and published artifacts", () => {
  test("generated source wrapper exposes a concrete SQLITE_VERSION", () => {
    expect(sourcePkg.SQLITE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test("dist runtime exports match the source wrapper", () => {
    expect(Object.keys(sourcePkg).sort()).toEqual(RUNTIME_EXPORTS)
    expect(Object.keys(distPkg).sort()).toEqual(RUNTIME_EXPORTS)
    expect(Object.keys(distPkg).sort()).toEqual(Object.keys(sourcePkg).sort())
    expect(distPkg.SQLITE_VERSION).toBe(sourcePkg.SQLITE_VERSION)
  })

  test("dist no longer exposes the legacy runtime surface", () => {
    expect("createParser" in distPkg).toBe(false)
    expect("createTokenizer" in distPkg).toBe(false)
    expect("SQLITE_LIB" in distPkg).toBe(false)
  })

  test("published tokenizer CLI preserves trailing stdin whitespace", () => {
    const result = runNodeCli(DIST_TOKENIZER_CLI, "SELECT 1   ", ["--include-trivia"])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")

    const lines = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))

    expect(
      lines.map((line) => ({
        name: line.name,
        text: line.text,
      })),
    ).toEqual([
      { name: "SELECT", text: "SELECT" },
      { name: "SPACE", text: " " },
      { name: "INTEGER", text: "1" },
      { name: "SPACE", text: "   " },
    ])
  })

  test("published parser CLI reports EOF errors at the true piped offset", () => {
    const result = runNodeCli(DIST_PARSER_CLI, "SELECT 1,   ")

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("col 13")
    expect(result.stderr).toContain("range [12, 12]")
  })
})
