// Shared helpers for the tokenizer test suites.  Loads the JSON dumps
// produced by the patched lemon + mkkeywordhash once, then exposes a
// pre-built default tokenizer plus factories for tokenizers with
// custom options (digit separators, reduced flag sets, ...).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTokenizer } from '../src/tokenize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');

export const parserDump = JSON.parse(
  readFileSync(join(fixtures, 'parser.json')),
);
export const keywordsDump = JSON.parse(
  readFileSync(join(fixtures, 'keywords.json')),
);

/** Default tokenizer: every feature flag enabled, no digit separator. */
export const tk = createTokenizer(parserDump, keywordsDump);

/** Tokenizer with the `_` digit separator (SQLite 3.45+ default). */
export const tkSep = createTokenizer(parserDump, keywordsDump, {
  digitSeparator: '_',
});

/** Build a tokenizer with custom options (flags, digit separator). */
export function makeTokenizer(opts = {}) {
  return createTokenizer(parserDump, keywordsDump, opts);
}

/**
 * Tokenise `sql` and return an array of `{name, text}` pairs, with trivia
 * (SPACE + COMMENT) suppressed by default.  Pass `{skipTrivia: false}` to
 * include them.
 */
export function lex(sql, opts, t = tk) {
  const out = [];
  for (const tok of t.tokenize(sql, opts)) {
    out.push({
      name: t.tokenName(tok.type),
      text: sql.slice(tok.start, tok.start + tok.length),
    });
  }
  return out;
}

/** Shortcut for tests that only care about token names, not their text. */
export function lexNames(sql, opts, t = tk) {
  return lex(sql, opts, t).map((x) => x.name);
}

/**
 * Tokenise `sql` and return lemonjs-shaped triples
 * `{tokenName, rawTokenName, lexeme}`.  Exists so the ported SQLite TCL
 * test files read close to their originals.  `tokenName` and
 * `rawTokenName` are always equal for us — claude-lemon doesn't do the
 * context-aware WINDOW/OVER/FILTER retokenization lemonjs performs —
 * but the field is kept so existing assertions transfer verbatim.
 */
export function tokenTriples(sql, t = tk) {
  const out = [];
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
export function firstIllegalLexeme(sql, t = tk) {
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
export function lexOne(sql, t = tk) {
  const toks = lex(sql, undefined, t);
  if (toks.length !== 1) {
    throw new Error(
      `expected exactly one token, got ${toks.length}: ${JSON.stringify(toks)}`,
    );
  }
  return toks[0];
}
