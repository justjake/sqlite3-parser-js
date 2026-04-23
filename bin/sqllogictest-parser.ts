#!/usr/bin/env bun
// sqllogictest-parser — developer CLI for parsing a sqllogictest `.test`
// script and dumping the record list (or user-facing error diagnostics)
// to stdout.  Handy for poking at format edge cases without writing a
// throwaway script.
//
//   sqllogictest-parser script.test
//   sqllogictest-parser - < script.test
//   cat script.test | sqllogictest-parser
//
// Not a production interface — reach for the library API
// (`import { parseTest } from 'sqlite3-parser/sqllogictest'`) in real
// code.  Errors do not abort parsing: diagnostics are printed to stderr
// and the record list is still emitted on stdout, but the process exits
// non-zero if any diagnostic was produced.

import { parseTest } from "../src/sqllogictest/testparser.ts"
import { resolveCliInput, runScript } from "../scripts/utils.ts"

await runScript(
  import.meta.main,
  {
    usage:
      "usage: sqllogictest-parser [--emit-trivia] [<input>]\n" +
      "  --emit-trivia        Emit top-level `#` comments as TestComment records.\n" +
      "  <input>              sqllogictest source, a path to a `.test` file, or '-' for stdin.",
    options: {
      "emit-trivia": { type: "boolean" },
    },
  },
  async ({ values, positionals }) => {
    const { source, filename } = await resolveCliInput(positionals)
    const result = parseTest({
      source,
      filename: filename ?? "<inline>",
      emitTrivia: Boolean(values["emit-trivia"]),
    })

    for (const err of result.errors) console.error(err.format())

    console.log(JSON.stringify(result.records, undefined, 2))

    if (result.errors.length > 0) process.exit(1)
  },
)
