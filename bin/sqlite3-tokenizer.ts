#!/usr/bin/env bun
// sqlite3-tokenizer — developer CLI for peeking at the lexer output on
// an arbitrary SQL string.  Useful for answering "does this input
// produce ILLEGAL or QNUMBER" kinds of questions without a full parse.
//
//   sqlite3-tokenizer "SELECT 1_2_3"
//   sqlite3-tokenizer --include-trivia "SELECT -- c\n 1"
//   sqlite3-tokenizer --digit-separator _ "SELECT 1_000"
//   echo "SELECT 1" | sqlite3-tokenizer
//
// Pinned to the `current` SQLite version — see the library API
// (`import { withOptions } from 'sqlite3-parser'`) for real use.

import { withOptions } from "../generated/current.ts"

interface CliOptions {
  includeTrivia: boolean
  digitSeparator: string | undefined
  sqlParts: string[]
}

function usage(): string {
  return (
    'usage: sqlite3-tokenizer [--include-trivia] [--digit-separator <char>] ["<sql>"]\n' +
    "  --include-trivia     Emit SPACE / COMMENT tokens (default: skip).\n" +
    "  --digit-separator    Single-char separator for numeric literals\n" +
    '                       (default: disabled; pass "_" for sqlite 3.45+ behaviour).\n' +
    "  <sql>                SQL to tokenise.  If omitted, read from stdin."
  )
}

function parseCli(argv: string[]): CliOptions {
  const opts: CliOptions = {
    includeTrivia: false,
    digitSeparator: undefined,
    sqlParts: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--include-trivia") {
      opts.includeTrivia = true
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

const mod = withOptions(
  cli.digitSeparator !== undefined ? { digitSeparator: cli.digitSeparator } : {},
)

for (const tok of mod.tokenize(sql, { emitTrivia: cli.includeTrivia })) {
  console.log(
    JSON.stringify({
      ...tok,
      name: mod.tokenName(tok.type) ?? null,
    }),
  )
}
