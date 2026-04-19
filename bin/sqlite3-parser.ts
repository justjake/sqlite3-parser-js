#!/usr/bin/env bun
// sqlite3-parser — developer CLI for parsing a SQL string and dumping
// the CST (or the enhanced error diagnostic) to stdout.  Handy for
// poking at grammar edge cases without writing a throwaway script.
//
//   sqlite3-parser "SELECT 1"
//   sqlite3-parser --pretty "SELECT 1 FROM t"
//   echo "SELECT 1" | sqlite3-parser
//
// Not a production interface — reach for the library API
// (`import { parse } from 'sqlite3-parser'`) in real code.  This CLI
// is pinned to whatever `vendor/manifest.json` marks as `current`.

import { parse, formatCst, type ParseError } from "../generated/current.ts"

interface CliOptions {
  pretty: boolean
  sqlParts: string[]
}

function usage(): string {
  return (
    'usage: sqlite3-parser [--pretty] ["<sql>"]\n' +
    "  --pretty   Print the CST as indented S-expressions instead of JSON.\n" +
    "  <sql>      SQL string to parse.  If omitted, read from stdin."
  )
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = { pretty: false, sqlParts: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--pretty") {
      opts.pretty = true
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
    return (await readStdin()).trimEnd()
  }
  console.error(usage())
  process.exit(2)
}

function formatError(e: ParseError): string {
  const lines: string[] = []
  lines.push(e.canonical)
  lines.push(`  at line ${e.line}, col ${e.col} range [${e.range[0]}, ${e.range[1]}]`)
  if (e.hint) lines.push(`  hint: ${e.hint}`)
  if (e.expected.length > 0) {
    const list = e.expected.slice(0, 8).join(", ")
    const more = e.expected.length > 8 ? ", ..." : ""
    lines.push(`  expected: ${list}${more}`)
  }
  return lines.join("\n")
}

const cli = parseCli(process.argv.slice(2))
const sql = await readSql(cli.sqlParts)
const result = parse(sql)

for (const err of result.errors) {
  console.error(formatError(err))
}

if (result.cst) {
  if (cli.pretty) console.log(formatCst(result.cst))
  else console.log(JSON.stringify(result.cst, null, 2))
}

process.exit(result.errors.length > 0 ? 1 : 0)
