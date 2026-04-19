// Port of sqlite's test/literal.test tokenizer-adjacent cases, matching
// the grouping in lemonjs/literal.sqlite.test.ts.
//
// There is overlap with test/sqlite/literal.test.js (which covers the
// same sqlite rows one-at-a-time).  We keep both: the per-row version
// is easier to blame when one specific literal regresses, and this
// block-assertion version catches subtle positional bugs (where the
// MINUS/PLUS lands relative to the number, etc.) by asserting the
// entire token stream at once.
//
// Requires the `_` digit separator for literal-3.x / literal-4.x
// QNUMBER assertions — matches sqlite's default build for 3.45+.

import { describe, test, expect } from "bun:test"
import { tokenTriples, tkSep } from "../helpers.ts"

// Digit-separator-enabled triples.  The top-level `tk` used by most
// helpers has the separator off, but every literal-*.x case in sqlite's
// literal.test assumes it's on.
function triplesSep(sql: string) {
  return tokenTriples(sql, tkSep)
}

describe("SQLite test/literal.test tokenizer cases", () => {
  test("literal-1.x and 2.x classify integer, hex, string, and float literals", () => {
    expect(
      triplesSep(
        "SELECT 45, 0xFF, -0x123FFFFFFFF, +0x7FFFFFFFFFFFFFFF, -45, '0xFF', -'0xFF', 1e12, 1.0, 1e1000, -1e1000",
      ),
    ).toEqual([
      { tokenName: "SELECT", rawTokenName: "SELECT", lexeme: "SELECT" },
      { tokenName: "INTEGER", rawTokenName: "INTEGER", lexeme: "45" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "INTEGER", rawTokenName: "INTEGER", lexeme: "0xFF" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "MINUS", rawTokenName: "MINUS", lexeme: "-" },
      { tokenName: "INTEGER", rawTokenName: "INTEGER", lexeme: "0x123FFFFFFFF" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "PLUS", rawTokenName: "PLUS", lexeme: "+" },
      { tokenName: "INTEGER", rawTokenName: "INTEGER", lexeme: "0x7FFFFFFFFFFFFFFF" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "MINUS", rawTokenName: "MINUS", lexeme: "-" },
      { tokenName: "INTEGER", rawTokenName: "INTEGER", lexeme: "45" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "STRING", rawTokenName: "STRING", lexeme: "'0xFF'" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "MINUS", rawTokenName: "MINUS", lexeme: "-" },
      { tokenName: "STRING", rawTokenName: "STRING", lexeme: "'0xFF'" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "FLOAT", rawTokenName: "FLOAT", lexeme: "1e12" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "FLOAT", rawTokenName: "FLOAT", lexeme: "1.0" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "FLOAT", rawTokenName: "FLOAT", lexeme: "1e1000" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "MINUS", rawTokenName: "MINUS", lexeme: "-" },
      { tokenName: "FLOAT", rawTokenName: "FLOAT", lexeme: "1e1000" },
    ])
  })

  test("literal-3.x classifies underscore-separated numeric forms as QNUMBER", () => {
    expect(
      triplesSep(
        "SELECT 1_000, 1.1_1, 1_0.1_1, 1e1_000, 12_3_456.7_8_9, 9_223_372_036_854_775_807",
      ),
    ).toEqual([
      { tokenName: "SELECT", rawTokenName: "SELECT", lexeme: "SELECT" },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1_000" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1.1_1" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1_0.1_1" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1e1_000" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "12_3_456.7_8_9" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "9_223_372_036_854_775_807" },
    ])
  })

  test("literal-4.x immediate scanner errors match SQLite for malformed numeric prefixes", () => {
    expect(triplesSep("SELECT 123a456, 1e_4, 1.4e+_4, 1.4e-_4")).toEqual([
      { tokenName: "SELECT", rawTokenName: "SELECT", lexeme: "SELECT" },
      { tokenName: "ILLEGAL", rawTokenName: "ILLEGAL", lexeme: "123a456" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "ILLEGAL", rawTokenName: "ILLEGAL", lexeme: "1e_4" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "ILLEGAL", rawTokenName: "ILLEGAL", lexeme: "1.4e" },
      { tokenName: "PLUS", rawTokenName: "PLUS", lexeme: "+" },
      { tokenName: "ID", rawTokenName: "ID", lexeme: "_4" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "ILLEGAL", rawTokenName: "ILLEGAL", lexeme: "1.4e" },
      { tokenName: "MINUS", rawTokenName: "MINUS", lexeme: "-" },
      { tokenName: "ID", rawTokenName: "ID", lexeme: "_4" },
    ])
  })

  test("literal-4.x leaves underscore-heavy malformed forms as QNUMBER for parser-side rejection", () => {
    expect(
      triplesSep(
        "SELECT 1_, 1_.4, 1_e4, 1.4_e4, 1.4e4_, 12__34, 1234_, 12._34, 12_.34, 12.34_, 1.0e1_______2",
      ),
    ).toEqual([
      { tokenName: "SELECT", rawTokenName: "SELECT", lexeme: "SELECT" },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1_" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1_.4" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1_e4" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1.4_e4" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1.4e4_" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "12__34" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1234_" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "12._34" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "12_.34" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "12.34_" },
      { tokenName: "COMMA", rawTokenName: "COMMA", lexeme: "," },
      { tokenName: "QNUMBER", rawTokenName: "QNUMBER", lexeme: "1.0e1_______2" },
    ])
  })
})
