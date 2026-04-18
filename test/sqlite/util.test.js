// Tests for src/util.js — the pure token-interpretation helpers ported
// from src/util.c.  Each suite exercises the sqlite3* function whose
// name it carries, with cases drawn from sqlite's existing Tcl tests
// (expr.test, literal.test, normalize.test) where one exists, plus
// direct regression cases for the util.c contracts.

import { describe, test, expect } from 'bun:test';
import {
  sqlite3Dequote,
  sqlite3DequoteNumber,
  sqlite3HexToInt,
  sqlite3HexToBlob,
  sqlite3Atoi64,
  sqlite3DecOrHexToI64,
  sqlite3GetInt32,
  sqlite3AtoF,
  ATOI_OK, ATOI_EXCESS_TEXT, ATOI_OVERFLOW, ATOI_AT_INT64_MIN,
} from '../../src/util.js';
import { tkSep, lex } from '../helpers.js';

const lexSep = (sql) => lex(sql, undefined, tkSep);

describe('sqlite3Dequote', () => {
  test("single-quoted strings collapse '' to '", () => {
    expect(sqlite3Dequote("'hello'")).toBe('hello');
    expect(sqlite3Dequote("'it''s ok'")).toBe("it's ok");
    expect(sqlite3Dequote("''")).toBe('');
    expect(sqlite3Dequote("''''")).toBe("'");
  });

  test('double-quoted identifiers collapse "" to "', () => {
    expect(sqlite3Dequote('"col"')).toBe('col');
    expect(sqlite3Dequote('"a""b"')).toBe('a"b');
  });

  test('backtick identifiers collapse `` to `', () => {
    expect(sqlite3Dequote('`col`')).toBe('col');
    expect(sqlite3Dequote('`a``b`')).toBe('a`b');
  });

  test('bracket identifiers strip [] (no escape semantics in practice)', () => {
    expect(sqlite3Dequote('[a-b]')).toBe('a-b');
    expect(sqlite3Dequote('[col name]')).toBe('col name');
  });

  test('non-quoted input is passed through unchanged (C no-op)', () => {
    expect(sqlite3Dequote('plain')).toBe('plain');
    expect(sqlite3Dequote('')).toBe('');
    expect(sqlite3Dequote(null)).toBe(null);
  });
});

describe('sqlite3DequoteNumber', () => {
  // Good cases from literal-3.* in sqlite's literal.test.
  test('1_000 → 1000 (INTEGER)', () => {
    expect(sqlite3DequoteNumber('1_000'))
      .toEqual({ op: 'INTEGER', text: '1000' });
  });
  test('1.1_1 → 1.11 (FLOAT)', () => {
    expect(sqlite3DequoteNumber('1.1_1'))
      .toEqual({ op: 'FLOAT', text: '1.11' });
  });
  test('12_3_456.7_8_9 → 123456.789 (FLOAT)', () => {
    expect(sqlite3DequoteNumber('12_3_456.7_8_9'))
      .toEqual({ op: 'FLOAT', text: '123456.789' });
  });
  test('1e1_000 → 1e1000 (FLOAT → Infinity via Number)', () => {
    expect(sqlite3DequoteNumber('1e1_000'))
      .toEqual({ op: 'FLOAT', text: '1e1000' });
    expect(Number('1e1000')).toBe(Infinity); // downstream parsing
  });
  test('9_223_372_036_854_775_807 (INT64_MAX)', () => {
    expect(sqlite3DequoteNumber('9_223_372_036_854_775_807'))
      .toEqual({ op: 'INTEGER', text: '9223372036854775807' });
  });

  // Error cases from literal-4.* — all produce the exact C wording.
  const badRows = [
    '1_',            // trailing separator
    '1_.4',          // separator before dot
    '1_e4',          // separator before exponent
    '1.4_e4',        // separator before exponent (post-dot)
    '1.4e4_',        // trailing separator after exponent
    '12__34',        // consecutive separators
    '1234_',         // trailing separator
    '12._34',        // separator right after dot
    '12_.34',        // separator before dot
    '12.34_',        // trailing separator
    '1.0e1_______2', // run of separators inside the exponent
  ];
  for (const lit of badRows) {
    test(`rejects ${JSON.stringify(lit)} with "unrecognized token" error`, () => {
      const r = sqlite3DequoteNumber(lit);
      expect(r.error).toBe(`unrecognized token: "${lit}"`);
    });
  }

  test('custom digitSeparator character', () => {
    expect(sqlite3DequoteNumber('1\u00a0000', { digitSeparator: '\u00a0' }))
      .toEqual({ op: 'INTEGER', text: '1000' });
  });
});

describe('sqlite3HexToInt', () => {
  test('ASCII digits', () => {
    for (let d = 0; d <= 9; d++) {
      expect(sqlite3HexToInt(String.fromCharCode(0x30 + d))).toBe(d);
    }
  });
  test('lowercase a-f', () => {
    expect(sqlite3HexToInt('a')).toBe(10);
    expect(sqlite3HexToInt('f')).toBe(15);
  });
  test('uppercase A-F', () => {
    expect(sqlite3HexToInt('A')).toBe(10);
    expect(sqlite3HexToInt('F')).toBe(15);
  });
  test('invalid chars yield NaN', () => {
    expect(sqlite3HexToInt('g')).toBe(NaN);
    expect(sqlite3HexToInt('!')).toBe(NaN);
    expect(sqlite3HexToInt(undefined)).toBe(NaN);
  });
  test('numeric char code input', () => {
    expect(sqlite3HexToInt(0x39)).toBe(9);
    expect(sqlite3HexToInt(0x61)).toBe(10);
  });
});

describe('sqlite3HexToBlob', () => {
  test("x'' is an empty Uint8Array", () => {
    expect(sqlite3HexToBlob("x''")).toEqual(new Uint8Array([]));
  });
  test("x'48656C6C6F' decodes to \"Hello\"", () => {
    const bytes = sqlite3HexToBlob("x'48656C6C6F'");
    expect(Array.from(bytes)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  });
  test("X'AB' (uppercase prefix)", () => {
    expect(Array.from(sqlite3HexToBlob("X'AB'"))).toEqual([0xab]);
  });
  test('mixed case hex digits', () => {
    expect(Array.from(sqlite3HexToBlob("x'aBcDEf'")))
      .toEqual([0xab, 0xcd, 0xef]);
  });
  test('odd hex-digit count throws', () => {
    expect(() => sqlite3HexToBlob("x'abc'")).toThrow();
  });
  test('missing wrapping throws', () => {
    expect(() => sqlite3HexToBlob('abcd')).toThrow();
  });
});

describe('sqlite3Atoi64', () => {
  test('small positive integer', () => {
    expect(sqlite3Atoi64('42')).toEqual({ value: 42n, rc: ATOI_OK });
  });
  test('negative integer', () => {
    expect(sqlite3Atoi64('-42')).toEqual({ value: -42n, rc: ATOI_OK });
  });
  test('explicit positive sign', () => {
    expect(sqlite3Atoi64('+7')).toEqual({ value: 7n, rc: ATOI_OK });
  });
  test('INT64_MAX', () => {
    expect(sqlite3Atoi64('9223372036854775807'))
      .toEqual({ value: 9223372036854775807n, rc: ATOI_OK });
  });
  test('INT64_MIN (exact, via minus prefix)', () => {
    // util.c:1250 special case: magnitude is 2^63, negative fits exactly.
    expect(sqlite3Atoi64('-9223372036854775808'))
      .toEqual({ value: -9223372036854775808n, rc: ATOI_OK });
  });
  test('+9223372036854775808 → special rc=3', () => {
    // The positive-2^63 case: magnitude fits unsigned but not signed.
    const r = sqlite3Atoi64('9223372036854775808');
    expect(r.rc).toBe(ATOI_AT_INT64_MIN);
  });
  test('overflow → clamp to INT64_MAX with rc=2', () => {
    const r = sqlite3Atoi64('99999999999999999999999');
    expect(r.value).toBe(9223372036854775807n);
    expect(r.rc).toBe(ATOI_OVERFLOW);
  });
  test('trailing non-space text → rc=1', () => {
    expect(sqlite3Atoi64('42abc')).toEqual({ value: 42n, rc: ATOI_EXCESS_TEXT });
  });
  test('trailing whitespace is allowed (rc=0)', () => {
    expect(sqlite3Atoi64('42   ')).toEqual({ value: 42n, rc: ATOI_OK });
  });
  test('leading whitespace is allowed', () => {
    expect(sqlite3Atoi64('   42')).toEqual({ value: 42n, rc: ATOI_OK });
  });
});

describe('sqlite3DecOrHexToI64', () => {
  test('0xFF', () => {
    expect(sqlite3DecOrHexToI64('0xFF'))
      .toEqual({ value: 255n, rc: ATOI_OK });
  });
  test('0xFFFFFFFFFFFFFFFF wraps to -1 (memcpy semantics)', () => {
    expect(sqlite3DecOrHexToI64('0xFFFFFFFFFFFFFFFF'))
      .toEqual({ value: -1n, rc: ATOI_OK });
  });
  test('0x123FFFFFFFF', () => {
    expect(sqlite3DecOrHexToI64('0x123FFFFFFFF'))
      .toEqual({ value: 0x123FFFFFFFFn, rc: ATOI_OK });
  });
  test('hex longer than 16 digits → overflow', () => {
    expect(sqlite3DecOrHexToI64('0x10000000000000001').rc).toBe(ATOI_OVERFLOW);
  });
  test('decimal path delegates to Atoi64', () => {
    expect(sqlite3DecOrHexToI64('123'))
      .toEqual({ value: 123n, rc: ATOI_OK });
  });
});

describe('sqlite3GetInt32', () => {
  test('plain decimal fits', () => {
    expect(sqlite3GetInt32('2147483647')).toEqual({ value: 2147483647, ok: true });
  });
  test('overflow returns {value:0, ok:false}', () => {
    expect(sqlite3GetInt32('2147483648')).toEqual({ value: 0, ok: false });
  });
  test('negative limit', () => {
    expect(sqlite3GetInt32('-2147483648')).toEqual({ value: -2147483648, ok: true });
  });
  test('hex 0xFF fits', () => {
    expect(sqlite3GetInt32('0xFF')).toEqual({ value: 255, ok: true });
  });
  test('hex with high bit set returns ok:false', () => {
    // util.c:1326: must not set the sign bit.
    expect(sqlite3GetInt32('0x80000000')).toEqual({ value: 0, ok: false });
  });
  test('trailing text is IGNORED (different from Atoi64)', () => {
    expect(sqlite3GetInt32('123xyz')).toEqual({ value: 123, ok: true });
  });
  test('empty / non-numeric', () => {
    expect(sqlite3GetInt32('abc')).toEqual({ value: 0, ok: false });
  });
});

describe('sqlite3AtoF', () => {
  test('integer literal', () => {
    const r = sqlite3AtoF('42');
    expect(r.value).toBe(42);
    expect(r.rc).toBeGreaterThan(0);
  });
  test('decimal literal', () => {
    expect(sqlite3AtoF('3.14').value).toBe(3.14);
  });
  test('exponent', () => {
    expect(sqlite3AtoF('1.5e-3').value).toBe(0.0015);
  });
  test('overflow to +Inf', () => {
    expect(sqlite3AtoF('1e1000').value).toBe(Infinity);
  });
  test('trailing non-space flagged rc < 0', () => {
    const r = sqlite3AtoF('42abc');
    expect(r.value).toBe(42);
    expect(r.rc).toBeLessThan(0);
  });
  test('empty string → rc=0', () => {
    expect(sqlite3AtoF('')).toEqual({ value: 0, rc: 0 });
  });
});

// End-to-end: use the tokenizer to lex, then feed the raw token text
// into the util helpers.  This is the pattern real consumers will use.
describe('tokenizer → util pipeline', () => {
  // These tests were previously in literal-4 (b) — the malformed QNUMBER
  // cases that the tokenizer accepts but sqlite3DequoteNumber rejects.
  test('tokenizer QNUMBER + util rejection matches sqlite end-to-end', () => {
    const rows = [
      '1_', '1_.4', '1_e4', '1.4_e4', '1.4e4_', '12__34',
      '1234_', '12._34', '12_.34', '12.34_', '1.0e1_______2',
    ];
    for (const lit of rows) {
      const toks = lexSep(lit);
      expect(toks.length).toBe(1);
      expect(toks[0].name).toBe('QNUMBER');
      const r = sqlite3DequoteNumber(toks[0].text);
      expect(r.error).toBe(`unrecognized token: "${lit}"`);
    }
  });

  test('valid QNUMBERs round-trip through DequoteNumber', () => {
    const rows = [
      ['1_000',   'INTEGER', '1000'],
      ['1.1_1',   'FLOAT',   '1.11'],
      ['1_0.1_1', 'FLOAT',   '10.11'],
    ];
    for (const [lit, op, text] of rows) {
      const toks = lexSep(lit);
      expect(toks[0].name).toBe('QNUMBER');
      expect(sqlite3DequoteNumber(toks[0].text)).toEqual({ op, text });
    }
  });
});
