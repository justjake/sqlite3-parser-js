#!/usr/bin/env bun
// sqlite3-parser — developer CLI for parsing a SQL string and dumping
// the AST (or user-facing error diagnostics) to stdout.  Handy for
// poking at grammar edge cases without writing a throwaway script.
//
//   sqlite3-parser "SELECT 1"
//   sqlite3-parser --pretty query.sql
//   sqlite3-parser --digit-separator _ "SELECT 1_000"
//   echo "SELECT 1" | sqlite3-parser -
//
// Not a production interface — reach for the library API
// (`import { parse } from 'sqlite3-parser'`) in real code.  This CLI
// is pinned to whatever `vendor/manifest.json` marks as `current`.

import { parse, parseStmt, withOptions } from "../generated/current.ts"
import { toSexpr } from "../src/ast/traverse.ts"
import { resolveCliInput, runScript } from "../scripts/utils.ts"

await runScript(
  import.meta.main,
  {
    usage:
      "usage: sqlite3-parser [--pretty] [--stmt] [--digit-separator <char>] [<input>]\n" +
      "  --pretty             Print the AST as indented S-expressions instead of JSON.\n" +
      "  --stmt               Parse a single statement via parseStmt (root is a Stmt\n" +
      "                       node rather than a CmdList).\n" +
      "  --digit-separator    Single-char separator for numeric literals\n" +
      '                       (default: disabled; pass "_" for sqlite 3.45+ behaviour).\n' +
      "  <input>              SQL text, a path to a file on disk, or '-' for stdin.",
    options: {
      pretty: { type: "boolean" },
      stmt: { type: "boolean" },
      "digit-separator": { type: "string" },
    },
  },
  async ({ values, positionals }) => {
    const { source } = await resolveCliInput(positionals)
    const digitSeparator = values["digit-separator"]
    const mod = digitSeparator !== undefined ? withOptions({ digitSeparator }) : undefined
    const parseFn = values.stmt ? (mod?.parseStmt ?? parseStmt) : (mod?.parse ?? parse)
    const result = parseFn(source)

    if (result.status === "error") {
      for (const err of result.errors) console.error(err.format())
      process.exit(1)
    }

    if (values.pretty) console.log(toSexpr(result.root))
    else console.log(JSON.stringify(result.root, undefined, 2))
  },
)
