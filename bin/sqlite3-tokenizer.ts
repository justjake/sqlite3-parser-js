#!/usr/bin/env bun
// sqlite3-tokenizer — developer CLI for peeking at the lexer output on
// an arbitrary SQL string.  Useful for answering "does this input
// produce ILLEGAL or QNUMBER" kinds of questions without a full parse.
//
//   sqlite3-tokenizer "SELECT 1_2_3"
//   sqlite3-tokenizer --include-trivia query.sql
//   sqlite3-tokenizer --digit-separator _ "SELECT 1_000"
//   echo "SELECT 1" | sqlite3-tokenizer -
//
// Pinned to the `current` SQLite version — see the library API
// (`import { withOptions } from 'sqlite3-parser'`) for real use.

import { withOptions } from "../generated/current.ts"
import { resolveCliInput, runScript } from "../src/cli/run.ts"

await runScript(
  import.meta.main,
  {
    usage:
      "usage: sqlite3-tokenizer [--include-trivia] [--digit-separator <char>] [<input>]\n" +
      "  --include-trivia     Emit SPACE / COMMENT tokens (default: skip).\n" +
      "  --digit-separator    Single-char separator for numeric literals\n" +
      '                       (default: disabled; pass "_" for sqlite 3.45+ behaviour).\n' +
      "  <input>              SQL text, a path to a file on disk, or '-' for stdin.",
    options: {
      "include-trivia": { type: "boolean" },
      "digit-separator": { type: "string" },
    },
  },
  async ({ values, positionals }) => {
    const { source } = await resolveCliInput(positionals)
    const digitSeparator = values["digit-separator"]
    const mod = withOptions(digitSeparator !== undefined ? { digitSeparator } : {})

    for (const tok of mod.tokenize(source, { emitTrivia: Boolean(values["include-trivia"]) })) {
      console.log(
        JSON.stringify({
          ...tok,
          name: mod.tokenName(tok.type) ?? null,
        }),
      )
    }
  },
)
