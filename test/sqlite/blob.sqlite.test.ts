// Port of sqlite's test/blob.test tokenizer-adjacent cases.
//
// Mirrors lemonjs/blob.sqlite.test.ts (which itself mirrors sqlite's
// Tcl test/blob.test): assert that valid `x'..'` literals tokenize as
// BLOB and that every malformed flavour sqlite's test suite calls out
// surfaces as ILLEGAL with the *same* lexeme span sqlite reports.

import { describe, test, expect } from 'bun:test';
import { tokenTriples, firstIllegalLexeme } from '../helpers.ts';

describe('SQLite test/blob.test tokenizer cases', () => {
  test('blob-1.3.x recognizes valid blob literals', () => {
    expect(tokenTriples("SELECT x'abcdEF12', x'0123456789abcdefABCDEF'")).toEqual([
      { tokenName: 'SELECT', rawTokenName: 'SELECT', lexeme: 'SELECT' },
      { tokenName: 'BLOB',   rawTokenName: 'BLOB',   lexeme: "x'abcdEF12'" },
      { tokenName: 'COMMA',  rawTokenName: 'COMMA',  lexeme: ',' },
      {
        tokenName: 'BLOB',
        rawTokenName: 'BLOB',
        lexeme: "x'0123456789abcdefABCDEF'",
      },
    ]);
  });

  // Every sqlite blob.test invalid-blob row names the span sqlite
  // reports.  We reproduce the row-by-row coverage because the edge
  // cases (non-hex chars, odd digit counts, unterminated blob eating
  // the rest of the input) each stress a different arm of the scanner.
  const invalidBlobCases = [
    { name: 'blob-1.4',  sql: "SELECT X'01020k304', 100", illegal: "X'01020k304'" },
    { name: 'blob-1.5',  sql: "SELECT X'01020, 100",      illegal: "X'01020, 100"  },
    { name: 'blob-1.6',  sql: "SELECT X'01020 100'",      illegal: "X'01020 100'"  },
    { name: 'blob-1.7',  sql: "SELECT X'01001'",          illegal: "X'01001'"      },
    { name: 'blob-1.8',  sql: "SELECT x'012/45'",         illegal: "x'012/45'"     },
    { name: 'blob-1.9',  sql: "SELECT x'012:45'",         illegal: "x'012:45'"     },
    { name: 'blob-1.10', sql: "SELECT x'012@45'",         illegal: "x'012@45'"     },
    { name: 'blob-1.11', sql: "SELECT x'012G45'",         illegal: "x'012G45'"     },
    { name: 'blob-1.12', sql: "SELECT x'012`45'",         illegal: "x'012`45'"     },
    { name: 'blob-1.13', sql: "SELECT x'012g45'",         illegal: "x'012g45'"     },
  ] as const;

  for (const c of invalidBlobCases) {
    test(`${c.name} reports the same illegal blob literal`, () => {
      expect(firstIllegalLexeme(c.sql)).toBe(c.illegal);
    });
  }
});
