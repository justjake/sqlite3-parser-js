// Port of sqlite's test/tokenize.test (tokenize-1.*, tokenize-2.*).
//
// In the original Tcl suite, each assertion runs a SQL statement through
// sqlite3_prepare_v2 and captures the whole-pipeline error message:
// `SELECT 1.0e+` → `unrecognized token: "1.0e"`.  That error comes from
// sqlite3RunParser() after the tokenizer emits an ILLEGAL token, so
// for our purposes we assert on the tokenizer output directly:
// the first non-trivia token produced for the suspect literal must be
// ILLEGAL with text matching the quoted portion of sqlite's message.

import { describe, test, expect } from 'bun:test';
import { lex, lexNames } from '../helpers.ts';

/** Find the first ILLEGAL token in the stream (or undefined). */
function firstIllegal(sql: string) {
  return lex(sql).find((t) => t.name === 'ILLEGAL');
}

describe('tokenize-1 (malformed floating-point literals)', () => {
  // Each row mirrors the sqlite Tcl test: the input after `SELECT`,
  // and the token text quoted in sqlite's error message.
  const cases = [
    ['1.1', '1.0e+',  '1.0e'],
    ['1.2', '1.0E+',  '1.0E'],
    ['1.3', '1.0e-',  '1.0e'],
    ['1.4', '1.0E-',  '1.0E'],
    ['1.5', '1.0e+/', '1.0e'],
    ['1.6', '1.0E+:', '1.0E'],
    ['1.7', '1.0e-:', '1.0e'],
    ['1.8', '1.0E-/', '1.0E'],
    ['1.9', '1.0F+5', '1.0F'],
    ['1.10','1.0d-10','1.0d'],
    ['1.11','1.0e,5', '1.0e'],
    ['1.12','1.0E.10','1.0E'],
  ];
  for (const [tn, input, unrec] of cases) {
    test(`tokenize-${tn}: ${JSON.stringify(input)} → ILLEGAL ${JSON.stringify(unrec)}`, () => {
      const bad = firstIllegal(input);
      expect(bad).toEqual({ name: 'ILLEGAL', text: unrec });
    });
  }
});

describe('tokenize-2 (unterminated block comment)', () => {
  // tokenize-2.1: `SELECT 1, 2 /*` → parser sees stray "*" after the
  // tokenizer stops scanning the block comment (which requires at least
  // three chars after the opening /* for the state machine to even enter
  // the scan).  In our tokenizer, "/*" with nothing after it is two
  // separate tokens: SLASH STAR.  sqlite's parser error "near \"*\"" is
  // what you'd get when those reach the parser.
  test('tokenize-2.1: "SELECT 1, 2 /*" emits SLASH STAR (not COMMENT)', () => {
    expect(lexNames('SELECT 1, 2 /*')).toEqual([
      'SELECT', 'INTEGER', 'COMMA', 'INTEGER', 'SLASH', 'STAR',
    ]);
  });

  // tokenize-2.2: `SELECT 1, 2 /* ` (a space after /*) IS accepted —
  // sqlite considers the comment unterminated-but-valid and the
  // statement returns (1, 2).  The comment is consumed to EOI.
  test('tokenize-2.2: "SELECT 1, 2 /* " consumes the rest as COMMENT', () => {
    const toks = lex('SELECT 1, 2 /* ', { skipTrivia: false });
    const lastName = toks[toks.length - 1].name;
    const lastText = toks[toks.length - 1].text;
    expect(lastName).toBe('COMMENT');
    expect(lastText.startsWith('/*')).toBe(true);
  });
});
