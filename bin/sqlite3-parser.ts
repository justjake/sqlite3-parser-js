#!/usr/bin/env bun
// sqlite3-parser — developer CLI for parsing a SQL string and dumping
// the AST (or user-facing error diagnostics) to stdout.  Handy for
// poking at grammar edge cases without writing a throwaway script.
//
//   sqlite3-parser "SELECT 1"
//   sqlite3-parser --pretty "SELECT 1 FROM t"
//   sqlite3-parser --digit-separator _ "SELECT 1_000"
//   echo "SELECT 1" | sqlite3-parser
//
// Not a production interface — reach for the library API
// (`import { parse } from 'sqlite3-parser'`) in real code.  This CLI
// is pinned to whatever `vendor/manifest.json` marks as `current`.

import { parse, withOptions } from "../generated/current.ts"
import { toSexpr } from "../src/traverse.ts"

interface CliOptions {
  pretty: boolean
  digitSeparator: string | undefined
  sqlParts: string[]
}

function usage(): string {
  return (
    'usage: sqlite3-parser [--pretty] [--digit-separator <char>] ["<sql>"]\n' +
    "  --pretty             Print the AST as indented S-expressions instead of JSON.\n" +
    "  --digit-separator    Single-char separator for numeric literals\n" +
    '                       (default: disabled; pass "_" for sqlite 3.45+ behaviour).\n' +
    "  <sql>                SQL string to parse.  If omitted, read from stdin."
  )
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = { pretty: false, digitSeparator: undefined, sqlParts: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--pretty") {
      opts.pretty = true
      continue
    }
    if (a === "--digit-separator") {
      if (i + 1 >= argv.length) throw new Error("missing value after --digit-separator")
      opts.digitSeparator = argv[++i]!
      continue
    }
    if (a === "-h" || a === "--help") {
      console.log(usage())
      process.exit(0)
    }
    opts.sqlParts.push(a)
  }
  return opts
}

async function readStdin(): Promise<string> {
  let data = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) data += chunk
  return data
}

async function readSql(parts: string[]): Promise<string> {
  if (parts.length > 0) return parts.join(" ")
  if (!process.stdin.isTTY) {
    return await readStdin()
  }
  console.error(usage())
  process.exit(2)
}

const cli = parseCli(process.argv.slice(2))
const sql = await readSql(cli.sqlParts)
const result =
  cli.digitSeparator !== undefined
    ? withOptions({ digitSeparator: cli.digitSeparator }).parse(sql)
    : parse(sql)

if (result.status === "errored") {
  for (const err of result.errors) console.error(err.format())
  process.exit(1)
}

if (cli.pretty) console.log(toSexpr(result.ast))
else console.log(JSON.stringify(result.ast, null, 2))
