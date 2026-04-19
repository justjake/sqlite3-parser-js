// Parity tests for src/semantic.ts handlers.  Each entry in
// generated/<ver>/semantic-actions.snapshot.json corresponds to a
// parse.y action that SQLite runs at parse time; a passing test here
// pins one piece of SQL that upstream rejects to a `SemanticError` the
// handler produces.
//
// When a new snapshot entry lands (via the drift check), add:
//   1. A handler in src/semantic.ts keyed by the entry's stableKey.
//   2. An `it(...)` below citing the parse.y:LINE the handler ports
//      and a SQL string upstream rejects.

import { describe, it } from "bun:test"

describe("semantic validation (parse.y action parity)", () => {
  it.todo("each snapshot entry has a handler and a test case", () => {})
})
