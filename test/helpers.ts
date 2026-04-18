// Shared helpers for the tokenizer test suites.  Loads the JSON dumps
// produced by the patched lemon + mkkeywordhash once, then exposes a
// pre-built default tokenizer plus factories for tokenizers with
// custom options (digit separators, reduced flag sets, ...).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createTokenizer,
  type CreateTokenizerOptions,
  type KeywordsDump,
  type TokenSpan,
  type TokenizeOpts,
  type Tokenizer,
} from '../src/tokenize.ts';
import type { LemonDump } from '../src/lempar.ts';

const here = dirname(fileURLToPath(import.meta.url));
const generated = join(here, '..', 'generated');

export const parserDump: LemonDump = JSON.parse(
  readFileSync(join(generated, 'parser.json'), 'utf8'),
);
export const keywordsDump: KeywordsDump = JSON.parse(
  readFileSync(join(generated, 'keywords.json'), 'utf8'),
);

/** Default tokenizer: every feature flag enabled, no digit separator. */
export const tk: Tokenizer = createTokenizer(parserDump, keywordsDump);

/** Tokenizer with the `_` digit separator (SQLite 3.45+ default). */
export const tkSep: Tokenizer = createTokenizer(parserDump, keywordsDump, {
  digitSeparator: '_',
});

/** Build a tokenizer with custom options (flags, digit separator). */
export function makeTokenizer(opts: CreateTokenizerOptions = {}): Tokenizer {
  return createTokenizer(parserDump, keywordsDump, opts);
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
 * `rawTokenName` are always equal for us — claude-lemon doesn't do the
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
