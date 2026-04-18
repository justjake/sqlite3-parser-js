// Port of sqlite's test/literal.test.  The original tests run each
// literal end-to-end (`SELECT $lit` → expected typeof + value).  We
// don't evaluate expressions, so for each row we assert:
//
//   * the literal tokenises as a single token,
//   * the token type matches the expected SQLite category, and
//   * the token text equals the literal as written.
//
// SQLite's `integer` / `real` type labels map to our TK_INTEGER /
// TK_FLOAT / TK_QNUMBER codes.  For digit-separator literals
// (1_000, 1e1_000, ...) SQLite emits TK_QNUMBER so that downstream
// code can reparse with separators stripped.

import { describe, test, expect } from 'bun:test';
import { lex, tkSep } from '../helpers.ts';

/** Tokenise with the digit separator enabled (matches literal-3.* cases). */
function lexSep(sql: string) {
  return lex(sql, undefined, tkSep);
}

describe('literal-1 (integer + hex literals)', () => {
  // literal-1.0 / 1.1 / 1.5 / 1.7 in sqlite Tcl: integers, hex integers.
  // Negative-prefixed forms (1.4, 1.8, 1.10) tokenise as two tokens in
  // any SQL tokenizer — the unary minus is part of the expression, not
  // the literal — so we only check the numeric part.
  const intCases = [
    ['1.0',  '45',                  'INTEGER'],
    ['1.1',  '0xFF',                'INTEGER'],
    ['1.2',  '0xFFFFFFFF',          'INTEGER'],
    ['1.3',  '0x123FFFFFFFF',       'INTEGER'],
    ['1.5',  '0xFFFFFFFFFFFFFFFF',  'INTEGER'],
    ['1.7',  '0x7FFFFFFFFFFFFFFF',  'INTEGER'],
  ];
  for (const [tn, lit, tokName] of intCases) {
    test(`literal-${tn}: ${lit}`, () => {
      expect(lex(lit)).toEqual([{ name: tokName, text: lit }]);
    });
  }

  // Signed forms: unary operator + numeric literal = two tokens.
  test('literal-1.4: -0x123FFFFFFFF tokenises as MINUS + INTEGER', () => {
    expect(lex('-0x123FFFFFFFF')).toEqual([
      { name: 'MINUS',   text: '-' },
      { name: 'INTEGER', text: '0x123FFFFFFFF' },
    ]);
  });
  test('literal-1.9: +0x7FFFFFFFFFFFFFFF tokenises as PLUS + INTEGER', () => {
    expect(lex('+0x7FFFFFFFFFFFFFFF')).toEqual([
      { name: 'PLUS',    text: '+' },
      { name: 'INTEGER', text: '0x7FFFFFFFFFFFFFFF' },
    ]);
  });

  // Quoted integer — 'string', not an integer.
  test("literal-1.11: '0xFF' is a STRING", () => {
    expect(lex("'0xFF'")).toEqual([{ name: 'STRING', text: "'0xFF'" }]);
  });

  // literal-1.14: the full 64-bit-min integer, unsigned written form.
  test('literal-1.14: -9223372036854775808 tokenises as MINUS + INTEGER', () => {
    expect(lex('-9223372036854775808')).toEqual([
      { name: 'MINUS',   text: '-' },
      { name: 'INTEGER', text: '9223372036854775808' },
    ]);
  });
});

describe('literal-2 (floating-point literals)', () => {
  const cases = [
    ['2.1', '1e12'],
    ['2.2', '1.0'],
    ['2.3', '1e1000'],  // sqlite evaluates to Inf; we just check the token
  ];
  for (const [tn, lit] of cases) {
    test(`literal-${tn}: ${lit}`, () => {
      expect(lex(lit)).toEqual([{ name: 'FLOAT', text: lit }]);
    });
  }

  // literal-2.4: -1e1000 → Inf.  We see MINUS + FLOAT.
  test('literal-2.4: -1e1000 tokenises as MINUS + FLOAT', () => {
    expect(lex('-1e1000')).toEqual([
      { name: 'MINUS', text: '-' },
      { name: 'FLOAT', text: '1e1000' },
    ]);
  });
});

describe('literal-3 (digit-separator literals — requires `_` enabled)', () => {
  // All of these become TK_QNUMBER in sqlite when SQLITE_DIGIT_SEPARATOR
  // is '_', because the scanner sees a non-digit separator mid-run and
  // wants downstream re-parsing.  Our tokenizer does the same thing.
  const cases = [
    ['3.1', '1_000'],
    ['3.2', '1.1_1'],
    ['3.3', '1_0.1_1'],
    ['3.4', '1e1_000'],
    ['3.5', '12_3_456.7_8_9'],
    ['3.6', '9_223_372_036_854_775_807'],
    ['3.7', '9_223_372_036_854_775_808'],
  ];
  for (const [tn, lit] of cases) {
    test(`literal-${tn}: ${lit} → single QNUMBER`, () => {
      expect(lexSep(lit)).toEqual([{ name: 'QNUMBER', text: lit }]);
    });
  }

  test('literal-3.8: -9_223_372_036_854_775_808 → MINUS + QNUMBER', () => {
    expect(lexSep('-9_223_372_036_854_775_808')).toEqual([
      { name: 'MINUS',   text: '-' },
      { name: 'QNUMBER', text: '9_223_372_036_854_775_808' },
    ]);
  });
});

describe('literal-4 (malformed numeric literals)', () => {
  // sqlite's Tcl suite reports `unrecognized token: "X"` for every row
  // below, but that error comes from two DIFFERENT sqlite layers:
  //
  //   a) tokenize.c itself — when 'e'/'E' appears without a valid
  //      exponent digit to follow, the tokenizer emits TK_ILLEGAL.
  //
  //   b) util.c sqlite3DequoteNumber — the tokenizer happily produces
  //      TK_QNUMBER for any digit+separator run, then this later pass
  //      rejects separators that aren't flanked by digits on both sides
  //      (`12_.34`, `1234_`, `12__34`, …).  These are post-tokenizer
  //      rejections, not tokenizer errors.
  //
  // For a tokenizer-only test suite we split the sqlite rows into (a)
  // "ILLEGAL at lex time" and (b) "QNUMBER at lex time, rejected later".

  describe('(a) ILLEGAL at the tokenizer — exponent without digits', () => {
    const rows: Array<[number, string, string]> = [
      [ 0, '123a456', '123a456'],   // literal-4.0 — digit-then-letter
      [ 3, '1e_4',    '1e_4'    ],  // literal-4.3
      [ 6, '1.4e+_4', '1.4e'    ],  // literal-4.6
      [ 7, '1.4e-_4', '1.4e'    ],  // literal-4.7
      [10, '1.4e_4',  '1.4e_4'  ],  // literal-4.10
    ];
    for (const [tn, lit, unrec] of rows) {
      test(`literal-4.${tn}: ${lit} → first ILLEGAL "${unrec}"`, () => {
        const firstBad = lexSep(lit).find((t) => t.name === 'ILLEGAL');
        expect(firstBad).toEqual({ name: 'ILLEGAL', text: unrec });
      });
    }
  });

  describe('(b) QNUMBER at the tokenizer — rejected later by dequote', () => {
    // These mirror util.c:339 sqlite3DequoteNumber's rejection of any
    // separator whose left or right neighbour isn't a digit, but our
    // tokenizer stops short of that validation (matches tokenize.c).
    const rows: Array<[number, string]> = [
      [ 1, '1_'           ],  // trailing separator
      [ 2, '1_.4'         ],  // separator before dot
      [ 4, '1_e4'         ],  // separator before exponent
      [ 5, '1.4_e4'       ],  // separator before exponent (post-dot)
      [ 8, '1.4e4_'       ],  // trailing separator after exponent
      [ 9, '1.4_e4'       ],  // (sqlite repeats row 5 as row 9)
      [11, '12__34'       ],  // consecutive separators
      [12, '1234_'        ],  // trailing separator
      [13, '12._34'       ],  // separator right after dot
      [14, '12_.34'       ],  // separator before dot
      [15, '12.34_'       ],  // trailing separator
      [16, '1.0e1_______2'],  // run of separators inside the exponent
    ];
    for (const [tn, lit] of rows) {
      test(`literal-4.${tn}: ${lit} → QNUMBER "${lit}"`, () => {
        expect(lexSep(lit)).toEqual([{ name: 'QNUMBER', text: lit }]);
      });
    }
  });
});
