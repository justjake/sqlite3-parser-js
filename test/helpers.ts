// Shared helpers for the tokenizer/parser test suites.
//
// Imports are deliberately routed through `generated/current.ts` so the
// test suite tracks whatever version `vendor/manifest.json` calls
// `current`.  To pin tests against a specific older version, import
// from `../generated/<version>/index.ts` directly — the same surface
// is available there.

import {
  createTokenizer,
  PARSER_DEFS,
  KEYWORD_DEFS,
  type CreateTokenizerOptions,
  type KeywordDefs,
  type ParserDefs,
  type Tokenizer,
  type TokenizeOpts,
} from '../generated/current.ts';

/** The parser defs used by every helper in this file.  Tracks `current`. */
export const parserDefs: ParserDefs = PARSER_DEFS;
/** The keywords defs used by every helper.  Tracks `current`. */
export const keywordDefs: KeywordDefs = KEYWORD_DEFS;

/** Default tokenizer: every feature flag enabled, no digit separator. */
export const tk: Tokenizer = createTokenizer();

/** Tokenizer with the `_` digit separator (SQLite 3.45+ default). */
export const tkSep: Tokenizer = createTokenizer({ digitSeparator: '_' });

/** Build a tokenizer with custom options (flags, digit separator). */
export function makeTokenizer(opts: CreateTokenizerOptions = {}): Tokenizer {
  return createTokenizer(opts);
}

/** A `{name, text}` pair — the lex() return shape used throughout the suite. */
export interface LexedToken {
  name: string;
  text: string;
}

/**
 * Tokenise `sql` and return an array of `{name, text}` pairs, with trivia
 * (SPACE + COMMENT) suppressed by default.  Pass `{skipTrivia: false}` to
 * include them.
 */
export function lex(
  sql: string,
  opts?: TokenizeOpts,
  t: Tokenizer = tk,
): LexedToken[] {
  const out: LexedToken[] = [];
  for (const tok of t.tokenize(sql, opts)) {
    out.push({
      name: t.tokenName(tok.type) ?? String(tok.type),
      text: sql.slice(tok.start, tok.start + tok.length),
    });
  }
  return out;
}

/** Shortcut for tests that only care about token names, not their text. */
export function lexNames(
  sql: string,
  opts?: TokenizeOpts,
  t: Tokenizer = tk,
): string[] {
  return lex(sql, opts, t).map((x) => x.name);
}

/** One triple yielded by tokenTriples — matches the lemonjs test shape. */
export interface TokenTriple {
  tokenName: string;
  rawTokenName: string;
  lexeme: string;
}

/**
 * Tokenise `sql` and return lemonjs-shaped triples
 * `{tokenName, rawTokenName, lexeme}`.  Exists so the ported SQLite TCL
 * test files read close to their originals.  `tokenName` and
 * `rawTokenName` are always equal for us — sqlite3-parser doesn't do the
 * context-aware WINDOW/OVER/FILTER retokenization lemonjs performs —
 * but the field is kept so existing assertions transfer verbatim.
 */
export function tokenTriples(sql: string, t: Tokenizer = tk): TokenTriple[] {
  const out: TokenTriple[] = [];
  for (const tok of t.tokenize(sql)) {
    const name = t.tokenName(tok.type) ?? String(tok.type);
    out.push({
      tokenName: name,
      rawTokenName: name,
      lexeme: sql.slice(tok.start, tok.start + tok.length),
    });
  }
  return out;
}

/** Return the lexeme of the first ILLEGAL token in `sql`, or null. */
export function firstIllegalLexeme(
  sql: string,
  t: Tokenizer = tk,
): string | null {
  for (const tok of t.tokenize(sql)) {
    const name = t.tokenName(tok.type);
    if (name === 'ILLEGAL') return sql.slice(tok.start, tok.start + tok.length);
  }
  return null;
}

/**
 * Shortcut for single-token tests: tokenise `sql`, assert there is
 * exactly one token, return that token.  Trivia is skipped.
 */
export function lexOne(sql: string, t: Tokenizer = tk): LexedToken {
  const toks = lex(sql, undefined, t);
  if (toks.length !== 1) {
    throw new Error(
      `expected exactly one token, got ${toks.length}: ${JSON.stringify(toks)}`,
    );
  }
  return toks[0]!;
}
