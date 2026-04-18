// Port of sqlite's test/keyword1.test tokenizer-adjacent cases.
//
// The original Tcl test checks that SQL statements like `CREATE TABLE abort`
// can be parsed even when a contextual keyword (abort, after, analyze, ...)
// appears where an identifier is expected.  SQLite achieves that via
// Lemon's %fallback directive: any of these keywords falls back to ID
// when the current state can't shift the keyword form.
//
// We can't test "CREATE TABLE abort" end-to-end without evaluating DDL,
// but we CAN assert the tokenizer + grammar-table invariants that make
// the fallback possible:
//
//   * the keyword tokenises as its own terminal (not ID),
//   * parserDump.tables.yyFallback[keywordId] points at ID's symbol id.
//
// If either invariant breaks, the fallback recovery at runtime won't
// fire, and the SQL-level behaviour breaks silently.

import { describe, test, expect } from 'bun:test';
import { parserDump, tokenTriples } from '../helpers.js';

const idSymbol = (parserDump.symbols as Array<{ id: number; name: string }>).find(
  (s) => s.name === 'ID',
);
if (!idSymbol) throw new Error('parser dump is missing the ID terminal');
const idTokenId = idSymbol.id;

const yyFallback = (parserDump.tables.yyFallback ?? []) as number[];

// Keyword list lifted from sqlite Tcl test/keyword1.test.  Every entry
// is a contextual keyword: it has a distinct TK_* code and Lemon's
// %fallback redirects it to TK_ID when the parser can't shift it.
const kwlist = [
  'abort',   'after',   'analyze',    'asc',      'attach',
  'before',  'begin',   'by',         'cascade',  'cast',
  'column',  'conflict','current_date','current_time','current_timestamp',
  'database','deferred','desc',       'detach',   'end',
  'each',    'exclusive','explain',   'fail',     'for',
  'glob',    'if',      'ignore',     'immediate','initially',
  'instead', 'key',     'like',       'match',    'of',
  'offset',  'plan',    'pragma',     'query',    'raise',
  'recursive','regexp', 'reindex',    'release',  'rename',
  'replace', 'restrict','rollback',   'row',      'savepoint',
  'temp',    'temporary','trigger',   'vacuum',   'view',
  'virtual', 'with',    'without',
] as const;

describe('SQLite test/keyword1.test tokenizer-adjacent cases', () => {
  for (const keyword of kwlist) {
    test(`keyword1-${keyword} tokenises as its own terminal with fallback to ID`, () => {
      const triples = tokenTriples(`SELECT ${keyword} FROM t`);
      // triples[0] is SELECT, triples[1] is the keyword under test.
      const kw = triples[1]!;
      expect(kw.rawTokenName).not.toBe('ID');
      expect(kw.tokenName).toBe(kw.rawTokenName);

      // Look up the numeric id for the token via the symbol table.
      const kwSymbol = (
        parserDump.symbols as Array<{ id: number; name: string }>
      ).find((s) => s.name === kw.rawTokenName);
      expect(kwSymbol).toBeDefined();
      expect(yyFallback[kwSymbol!.id]).toBe(idTokenId);
    });
  }
});
