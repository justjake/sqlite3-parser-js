// Hand-port of src/tokenize.c (sqlite3GetToken) to TypeScript.
//
// The lex state machine is fixed by SQLite's lexical rules and changes
// rarely. The token codes (TK_*) and the SQL keyword table are not
// fixed — they come from the JSON dumps emitted by the patched lemon
// (parser.json) and mkkeywordhash (keywords.json), so this module
// stays in sync with whatever sqlite checkout produced those dumps.
//
// The lexer operates on a JavaScript string, indexing by code unit.
// Indexing past end-of-string returns `undefined`, which compares !== to
// every character literal — so we intentionally rely on that instead of
// writing `i < len` checks everywhere.  Characters ≥ 0x80 in the input
// are treated as identifier characters (matching SQLite's rule that any
// high byte is valid inside an identifier).

import type { LemonDump, TokenId } from './lempar.ts';

// ---------------------------------------------------------------------------
// Public types — the shape of the keywords-dump, tokenizer options, and
// the tokenizer itself.  Downstream modules (parser.ts) import these to
// avoid re-declaring ad-hoc shapes.
// ---------------------------------------------------------------------------

/**
 * The set of SQLITE_OMIT_* / SQLITE_ENABLE_* flag names that gate
 * keywords in SQLite's grammar.  The list is hard-coded in
 * tool/mkkeywordhash.c's `#define` block (see the patch we apply) and
 * is stable across sqlite versions; we mirror it here so the compiler
 * can check flag names at call sites.
 */
export type MaskFlag =
  | 'ALTER' | 'ALWAYS' | 'ANALYZE' | 'ATTACH'
  | 'AUTOINCR' | 'CAST' | 'COMPOUND' | 'CONFLICT'
  | 'EXPLAIN' | 'FKEY' | 'PRAGMA' | 'REINDEX'
  | 'SUBQUERY' | 'TRIGGER' | 'VACUUM' | 'VIEW'
  | 'VTAB' | 'AUTOVACUUM' | 'CTE' | 'UPSERT'
  | 'WINDOWFUNC' | 'GENCOL' | 'RETURNING' | 'ORDERSET';

/** One keyword entry in the dump produced by the patched mkkeywordhash. */
export interface KeywordEntry {
  /** Uppercase ASCII keyword text, e.g. `"SELECT"`, `"BEGIN"`. */
  readonly name: string;
  /** Lemon TK_* symbol name with the `TK_` prefix, e.g. `"TK_SELECT"`. */
  readonly tokenName: string;
  /** mkkeywordhash's hash-chain priority (higher = probed first). */
  readonly priority: number;
  /** Raw bitmask; bit positions are documented on MaskFlag. */
  readonly mask: number;
  /** Symbolic flag names equivalent to `mask`. */
  readonly flags: readonly MaskFlag[];
}

/** Shape of the keywords.json file produced by mkkeywordhash -J. */
export interface KeywordsDump {
  readonly meta: {
    readonly sourceFile: string;
    readonly schemaVersion: number;
    readonly keywordCount: number;
    /** Bit-name → bit-value map; mirrors the maskFlags in the C patch. */
    readonly maskFlags: Readonly<Record<MaskFlag, number>>;
  };
  readonly keywords: readonly KeywordEntry[];
}

/** Options for `createTokenizer`. */
export interface CreateTokenizerOptions {
  /**
   * Which feature flags should be enabled at parse time.  Keywords whose
   * mask intersects this set are recognised; others fall back to TK_ID.
   * Defaults to the full set of flags present in the dump (i.e. "every
   * feature the dump was built with is on").  `ALWAYS` is always added
   * regardless of the caller's choice.
   */
  readonly flags?: readonly MaskFlag[];
  /**
   * Single-character digit separator (SQLite 3.45+ supports `'_'`).
   * Empty string disables the feature.
   */
  readonly digitSeparator?: string;
}

/** Options for one call to `tokenizer.tokenize(sql, opts?)`. */
export interface TokenizeOpts {
  /** Drop SPACE and COMMENT tokens from the output stream.  Default: true. */
  readonly skipTrivia?: boolean;
}

/** One token as yielded by `tokenizer.tokenize()`. */
export interface TokenSpan {
  readonly type: TokenId;
  readonly start: number;
  readonly length: number;
}

/**
 * The 33 TK_* codes the lexer emits directly.  Every key is required
 * — their presence is verified at `createTokenizer` time by looking
 * them up in the parser dump's symbol table.
 *
 * Matches the `switch(aiClass[*z])` in src/tokenize.c:276.
 */
export interface TokenizerTokens {
  readonly SPACE:    TokenId;
  readonly COMMENT:  TokenId;
  readonly ILLEGAL:  TokenId;
  readonly PTR:      TokenId;
  readonly MINUS:    TokenId;
  readonly LP:       TokenId;
  readonly RP:       TokenId;
  readonly SEMI:     TokenId;
  readonly PLUS:     TokenId;
  readonly STAR:     TokenId;
  readonly SLASH:    TokenId;
  readonly REM:      TokenId;
  readonly EQ:       TokenId;
  readonly LE:       TokenId;
  readonly NE:       TokenId;
  readonly LT:       TokenId;
  readonly LSHIFT:   TokenId;
  readonly GE:       TokenId;
  readonly RSHIFT:   TokenId;
  readonly GT:       TokenId;
  readonly BITOR:    TokenId;
  readonly CONCAT:   TokenId;
  readonly COMMA:    TokenId;
  readonly BITAND:   TokenId;
  readonly BITNOT:   TokenId;
  readonly DOT:      TokenId;
  readonly STRING:   TokenId;
  readonly ID:       TokenId;
  readonly INTEGER:  TokenId;
  readonly FLOAT:    TokenId;
  readonly QNUMBER:  TokenId;
  readonly VARIABLE: TokenId;
  readonly BLOB:     TokenId;
}

/** Return type of `createTokenizer`. */
export interface Tokenizer {
  /** TK_* codes the tokenizer emits directly. */
  readonly tokens: TokenizerTokens;
  /** TokenId → display name (`"SELECT"`, `"ID"`, …) or undefined. */
  tokenName(code: TokenId): string | undefined;
  /** Iterate tokens in `sql`.  Trivia is skipped by default. */
  tokenize(sql: string, opts?: TokenizeOpts): IterableIterator<TokenSpan>;
  /** @internal — exposed for tests. */
  _nextToken(z: string, p: number, outType: [TokenId]): number;
  /** @internal — exposed for tests. */
  readonly _keywordCount: number;
}

// ---------------------------------------------------------------------------
// Character classes — copied verbatim from src/tokenize.c (SQLITE_ASCII).
// Indexing: aiClass[byte 0..0xFF] -> CC_*.
// ---------------------------------------------------------------------------

const CC_X        = 0;   // The letter 'x', start of BLOB literal
const CC_KYWD0    = 1;   // First letter of a keyword
const CC_KYWD     = 2;   // Alphabetic or '_'.  Usable in a keyword
const CC_DIGIT    = 3;   // Digits
const CC_DOLLAR   = 4;   // '$'
const CC_VARALPHA = 5;   // '@', '#', ':'
const CC_VARNUM   = 6;   // '?'
const CC_SPACE    = 7;
const CC_QUOTE    = 8;   // '"', '\'', '`'
const CC_QUOTE2   = 9;   // '['
const CC_PIPE     = 10;
const CC_MINUS    = 11;
const CC_LT       = 12;
const CC_GT       = 13;
const CC_EQ       = 14;
const CC_BANG     = 15;
const CC_SLASH    = 16;
const CC_LP       = 17;
const CC_RP       = 18;
const CC_SEMI     = 19;
const CC_PLUS     = 20;
const CC_STAR     = 21;
const CC_PERCENT  = 22;
const CC_COMMA    = 23;
const CC_AND      = 24;
const CC_TILDA    = 25;
const CC_DOT      = 26;
const CC_ID       = 27;  // Unicode characters usable in IDs
const CC_ILLEGAL  = 28;
const CC_NUL      = 29;
const CC_BOM      = 30;

const aiClass = new Uint8Array([
  // 0x
  29, 28, 28, 28, 28, 28, 28, 28, 28,  7,  7, 28,  7,  7, 28, 28,
  // 1x
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  // 2x
   7, 15,  8,  5,  4, 22, 24,  8, 17, 18, 21, 20, 23, 11, 26, 16,
  // 3x
   3,  3,  3,  3,  3,  3,  3,  3,  3,  3,  5, 19, 12, 14, 13,  6,
  // 4x
   5,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  // 5x
   1,  1,  1,  1,  1,  1,  1,  1,  0,  2,  2,  9, 28, 28, 28,  2,
  // 6x
   8,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,  1,
  // 7x
   1,  1,  1,  1,  1,  1,  1,  1,  0,  2,  2, 28, 10, 28, 25, 28,
  // 8x..ff: all CC_ID (high-byte; valid identifier chars), with one CC_BOM
  // for 0xEF (UTF-8 BOM start).
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // 8x
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // 9x
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // Ax
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // Bx
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // Cx
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // Dx
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 30,  // Ex
  27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27,  // Fx
]);

// Look up the character class of the character at z[i].  Returns CC_NUL
// at end-of-input (matching C's null-terminated string behaviour) and
// CC_ID for non-ASCII characters (matching SQLite's "high byte is
// identifier" rule).  Used whenever the lex loop needs to dispatch on
// class rather than compare to a specific character.
function classAt(z: string, i: number): number {
  const c = z.charCodeAt(i);
  if (c !== c) return CC_NUL;        // NaN -> past end
  if (c > 0xff) return CC_ID;
  return aiClass[c];
}

// ---------------------------------------------------------------------------
// Identifier-character predicate, derived from sqlite3CtypeMap (mask 0x46).
// True for: a-z, A-Z, 0-9, '_', '$', and any code point ≥ 0x80.
// Works on a single character (length-1 string) or `undefined` at EOI.
// ---------------------------------------------------------------------------
function isIdChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  if (ch.charCodeAt(0) >= 0x80) return true;
  return (
    (ch >= '0' && ch <= '9') ||
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= 'a' && ch <= 'z') ||
    ch === '_' || ch === '$'
  );
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}
function isXDigit(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return (
    (ch >= '0' && ch <= '9') ||
    (ch >= 'A' && ch <= 'F') ||
    (ch >= 'a' && ch <= 'f')
  );
}
function isSpace(ch: string | undefined): boolean {
  // sqlite3Isspace: 0x09..0x0d and 0x20 (space, tab, LF, VT, FF, CR).
  if (ch === ' ') return true;
  if (ch === undefined) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x09 && c <= 0x0d;
}

// SQLite supports `1_000_000` style digit separators when compiled with
// SQLITE_DIGIT_SEPARATOR set to '_'.  Most builds disable it.  We
// follow the reference build: separator off by default; settable as a
// single character or the empty string to disable.
const DEFAULT_DIGIT_SEPARATOR = '';

// ---------------------------------------------------------------------------
// createTokenizer
//
// Build a tokenizer bound to a particular sqlite checkout's parser+
// keyword dumps.  See the `Tokenizer` interface for the returned shape.
// ---------------------------------------------------------------------------
export function createTokenizer(
  parserDump: LemonDump,
  keywordsDump: KeywordsDump,
  opts: CreateTokenizerOptions = {},
): Tokenizer {
  const digitSep = opts.digitSeparator ?? DEFAULT_DIGIT_SEPARATOR;
  const hasDigitSep = typeof digitSep === 'string' && digitSep.length === 1;

  // Resolve TK_* names -> integer codes via the parser dump's symbol
  // table.  The dump holds names without the TK_ prefix (e.g.
  // "SELECT", "ID").  isTerminal=true narrows SymbolId down to TokenId;
  // TS can't prove that, so we do the cast at the assignment boundary.
  const tokenCode = new Map<string, TokenId>();
  const tokenNameMap = new Map<TokenId, string>();
  for (const sym of parserDump.symbols) {
    if (!sym.isTerminal) continue;
    const id = sym.id as TokenId;
    tokenCode.set(sym.name, id);
    tokenNameMap.set(id, sym.name);
  }
  function requireToken(name: string): TokenId {
    const code = tokenCode.get(name);
    if (code === undefined) {
      throw new Error(
        `tokenize.ts: parser dump is missing terminal token "${name}". ` +
        `This usually means the parser dump and tokenizer are out of sync.`,
      );
    }
    return code;
  }

  // Token codes the lex loop emits directly.  These names match the
  // TK_* constants the C tokenizer uses; lemon assigns the actual ints.
  const T: TokenizerTokens = {
    SPACE:    requireToken('SPACE'),
    COMMENT:  requireToken('COMMENT'),
    ILLEGAL:  requireToken('ILLEGAL'),
    PTR:      requireToken('PTR'),
    MINUS:    requireToken('MINUS'),
    LP:       requireToken('LP'),
    RP:       requireToken('RP'),
    SEMI:     requireToken('SEMI'),
    PLUS:     requireToken('PLUS'),
    STAR:     requireToken('STAR'),
    SLASH:    requireToken('SLASH'),
    REM:      requireToken('REM'),
    EQ:       requireToken('EQ'),
    LE:       requireToken('LE'),
    NE:       requireToken('NE'),
    LT:       requireToken('LT'),
    LSHIFT:   requireToken('LSHIFT'),
    GE:       requireToken('GE'),
    RSHIFT:   requireToken('RSHIFT'),
    GT:       requireToken('GT'),
    BITOR:    requireToken('BITOR'),
    CONCAT:   requireToken('CONCAT'),
    COMMA:    requireToken('COMMA'),
    BITAND:   requireToken('BITAND'),
    BITNOT:   requireToken('BITNOT'),
    DOT:      requireToken('DOT'),
    STRING:   requireToken('STRING'),
    ID:       requireToken('ID'),
    INTEGER:  requireToken('INTEGER'),
    FLOAT:    requireToken('FLOAT'),
    QNUMBER:  requireToken('QNUMBER'),
    VARIABLE: requireToken('VARIABLE'),
    BLOB:     requireToken('BLOB'),
  };

  // Build the keyword lookup map.  Keys are uppercase ASCII keyword
  // strings; values are TK_* codes.  We filter by enabled flags so that
  // (e.g.) WINDOWFUNC keywords disappear when SQLITE_OMIT_WINDOWFUNC is
  // configured.
  const allFlags = Object.keys(keywordsDump.meta?.maskFlags ?? {}) as MaskFlag[];
  const enabledFlags = new Set<MaskFlag>(opts.flags ?? allFlags);
  enabledFlags.add('ALWAYS'); // ALWAYS keywords are unconditional.

  const keywordCode = new Map<string, TokenId>();
  for (const kw of keywordsDump.keywords) {
    if (!kw.flags?.length) continue;
    if (!kw.flags.some((f) => enabledFlags.has(f))) continue;
    const codeName = kw.tokenName.replace(/^TK_/, '');
    keywordCode.set(kw.name, requireToken(codeName));
  }

  // -----------------------------------------------------------------------
  // The lex loop itself.  Single-token entry point — equivalent to
  // sqlite3GetToken(z, &tokenType) in C.
  //
  // Returns the number of code units consumed and writes the token type
  // to outType[0].  For consistency with the C version we keep a small
  // mutable holder.
  // -----------------------------------------------------------------------
  function nextToken(z: string, p: number, outType: [TokenId]): number {
    let i: number;
    switch (classAt(z, p)) {
      case CC_SPACE: {
        for (i = p + 1; isSpace(z[i]); i++) {}
        outType[0] = T.SPACE;
        return i - p;
      }
      case CC_MINUS: {
        if (z[p + 1] === '-') {
          // -- line comment: consume to '\n' or EOI.
          for (i = p + 2; z[i] !== undefined && z[i] !== '\n'; i++) {}
          outType[0] = T.COMMENT;
          return i - p;
        }
        if (z[p + 1] === '>') {
          outType[0] = T.PTR;
          return z[p + 2] === '>' ? 3 : 2;
        }
        outType[0] = T.MINUS;
        return 1;
      }
      case CC_LP:    outType[0] = T.LP;    return 1;
      case CC_RP:    outType[0] = T.RP;    return 1;
      case CC_SEMI:  outType[0] = T.SEMI;  return 1;
      case CC_PLUS:  outType[0] = T.PLUS;  return 1;
      case CC_STAR:  outType[0] = T.STAR;  return 1;
      case CC_SLASH: {
        if (z[p + 1] !== '*' || z[p + 2] === undefined) {
          outType[0] = T.SLASH;
          return 1;
        }
        // /* ... */ block comment.  Consume until "*/" or EOI.
        i = p + 3;
        let prev = z[p + 2];
        while (z[i] !== undefined && !(prev === '*' && z[i] === '/')) {
          prev = z[i];
          i++;
        }
        if (z[i] !== undefined) i++; // include the closing '/'
        outType[0] = T.COMMENT;
        return i - p;
      }
      case CC_PERCENT: outType[0] = T.REM; return 1;
      case CC_EQ: {
        outType[0] = T.EQ;
        return z[p + 1] === '=' ? 2 : 1;
      }
      case CC_LT: {
        const c = z[p + 1];
        if (c === '=') { outType[0] = T.LE;     return 2; }
        if (c === '>') { outType[0] = T.NE;     return 2; }
        if (c === '<') { outType[0] = T.LSHIFT; return 2; }
        outType[0] = T.LT;
        return 1;
      }
      case CC_GT: {
        const c = z[p + 1];
        if (c === '=') { outType[0] = T.GE;     return 2; }
        if (c === '>') { outType[0] = T.RSHIFT; return 2; }
        outType[0] = T.GT;
        return 1;
      }
      case CC_BANG: {
        if (z[p + 1] === '=') {
          outType[0] = T.NE;
          return 2;
        }
        outType[0] = T.ILLEGAL;
        return 1;
      }
      case CC_PIPE: {
        if (z[p + 1] === '|') {
          outType[0] = T.CONCAT;
          return 2;
        }
        outType[0] = T.BITOR;
        return 1;
      }
      case CC_COMMA: outType[0] = T.COMMA;  return 1;
      case CC_AND:   outType[0] = T.BITAND; return 1;
      case CC_TILDA: outType[0] = T.BITNOT; return 1;
      case CC_QUOTE: {
        // '..', "..", `..`  with doubled-quote escape.
        const delim = z[p];
        let c: string | undefined;
        for (i = p + 1; (c = z[i]) !== undefined; i++) {
          if (c === delim) {
            if (z[i + 1] === delim) {
              i++; // escaped — keep going
            } else {
              break;
            }
          }
        }
        if (c === "'") {
          outType[0] = T.STRING;
          return i - p + 1;
        }
        if (c !== undefined) {
          outType[0] = T.ID; // closed " or `
          return i - p + 1;
        }
        outType[0] = T.ILLEGAL; // unterminated
        return i - p;
      }
      case CC_DOT: {
        if (!isDigit(z[p + 1])) {
          outType[0] = T.DOT;
          return 1;
        }
        // Leading-dot float such as ".5" — delegate to the number scanner.
        return scanNumber(z, p, outType, /*startsWithDot=*/true);
      }
      case CC_DIGIT: {
        return scanNumber(z, p, outType, /*startsWithDot=*/false);
      }
      case CC_QUOTE2: {
        // [bracketed identifier]
        for (i = p + 1; z[i] !== undefined; i++) {
          if (z[i] === ']') {
            outType[0] = T.ID;
            return i - p + 1;
          }
        }
        outType[0] = T.ILLEGAL;
        return i - p;
      }
      case CC_VARNUM: {
        // ? or ?123
        outType[0] = T.VARIABLE;
        for (i = p + 1; isDigit(z[i]); i++) {}
        return i - p;
      }
      case CC_DOLLAR:
      case CC_VARALPHA: {
        let n = 0;
        outType[0] = T.VARIABLE;
        i = p + 1;
        while (z[i] !== undefined) {
          const c = z[i];
          if (isIdChar(c)) {
            n++;
            i++;
            continue;
          }
          // TCL-style variable expansion:  $foo(...)
          if (c === '(' && n > 0) {
            let cc: string | undefined;
            do {
              i++;
              cc = z[i];
            } while (cc !== undefined && !isSpace(cc) && cc !== ')');
            if (cc === ')') {
              i++;
            } else {
              outType[0] = T.ILLEGAL;
            }
            break;
          }
          // ::  scope operator:  $foo::bar
          if (c === ':' && z[i + 1] === ':') {
            i += 2;
            continue;
          }
          break;
        }
        if (n === 0) outType[0] = T.ILLEGAL;
        return i - p;
      }
      case CC_KYWD0: {
        // Identifier or keyword.  KYWD0 starts; KYWD continues; if any
        // non-keyword IdChar appears it's just a plain ID.
        if (classAt(z, p + 1) > CC_KYWD) {
          // Second char is not a keyword-continuation char.  Either a
          // one-character ID (e.g. "a" in "a+b") or a longer
          // identifier that just happens to contain non-KYWD IdChars
          // (digits, non-ASCII, etc.).
          i = p + 1;
          if (isIdChar(z[i])) {
            i++;
            while (isIdChar(z[i])) i++;
            outType[0] = T.ID;
            return i - p;
          }
          return finishKeyword(z, p, i, outType);
        }
        for (i = p + 2; classAt(z, i) <= CC_KYWD; i++) {}
        if (isIdChar(z[i])) {
          // Continued past the keyword char-class — definitely an ID.
          i++;
          while (isIdChar(z[i])) i++;
          outType[0] = T.ID;
          return i - p;
        }
        return finishKeyword(z, p, i, outType);
      }
      case CC_X: {
        // x'...' BLOB literal, or fall through to identifier.
        if (z[p + 1] === "'") {
          outType[0] = T.BLOB;
          for (i = p + 2; isXDigit(z[i]); i++) {}
          if (z[i] !== "'" || ((i - p - 2) % 2)) {
            outType[0] = T.ILLEGAL;
            while (z[i] !== undefined && z[i] !== "'") i++;
          }
          if (z[i] !== undefined) i++; // consume closing quote
          return i - p;
        }
        // Fall through: 'x' is a normal identifier start.
        i = p + 1;
        while (isIdChar(z[i])) i++;
        outType[0] = T.ID;
        return i - p;
      }
      case CC_KYWD:
      case CC_ID: {
        i = p + 1;
        while (isIdChar(z[i])) i++;
        outType[0] = T.ID;
        return i - p;
      }
      case CC_BOM: {
        // UTF-8 BOM is 0xef 0xbb 0xbf at the start of the input.
        if (z.charCodeAt(p + 1) === 0xbb && z.charCodeAt(p + 2) === 0xbf) {
          outType[0] = T.SPACE;
          return 3;
        }
        i = p + 1;
        while (isIdChar(z[i])) i++;
        outType[0] = T.ID;
        return i - p;
      }
      case CC_NUL: {
        outType[0] = T.ILLEGAL;
        return 0;
      }
      default: {
        outType[0] = T.ILLEGAL;
        return 1;
      }
    }
  }

  // Numeric literal (integer / float / hex / quoted-number with `_`
  // separator).  Mirrors the CC_DIGIT case in tokenize.c, plus the
  // CC_DOT fall-through for ".5" floats.
  function scanNumber(
    z: string,
    p: number,
    outType: [TokenId],
    startsWithDot: boolean,
  ): number {
    let i = p;
    outType[0] = T.INTEGER;

    if (
      !startsWithDot &&
      z[p] === '0' &&
      (z[p + 1] === 'x' || z[p + 1] === 'X') &&
      isXDigit(z[p + 2])
    ) {
      // 0x... hex integer (with optional `_` separators if configured).
      for (i = p + 3; z[i] !== undefined; i++) {
        if (isXDigit(z[i])) continue;
        if (hasDigitSep && z[i] === digitSep) {
          outType[0] = T.QNUMBER;
          continue;
        }
        break;
      }
    } else {
      if (!startsWithDot) {
        for (i = p; z[i] !== undefined; i++) {
          if (isDigit(z[i])) continue;
          if (hasDigitSep && z[i] === digitSep) {
            outType[0] = T.QNUMBER;
            continue;
          }
          break;
        }
      }
      // Fractional part.
      if ((startsWithDot && i === p) || z[i] === '.') {
        if (outType[0] === T.INTEGER) outType[0] = T.FLOAT;
        i = startsWithDot ? p + 1 : i + 1;
        for (; z[i] !== undefined; i++) {
          if (isDigit(z[i])) continue;
          if (hasDigitSep && z[i] === digitSep) {
            outType[0] = T.QNUMBER;
            continue;
          }
          break;
        }
      }
      // Exponent:  e[+-]?digits
      if (
        (z[i] === 'e' || z[i] === 'E') &&
        (isDigit(z[i + 1]) ||
          ((z[i + 1] === '+' || z[i + 1] === '-') && isDigit(z[i + 2])))
      ) {
        if (outType[0] === T.INTEGER) outType[0] = T.FLOAT;
        i += 2;
        for (; z[i] !== undefined; i++) {
          if (isDigit(z[i])) continue;
          if (hasDigitSep && z[i] === digitSep) {
            outType[0] = T.QNUMBER;
            continue;
          }
          break;
        }
      }
    }
    // A digit immediately followed by an identifier character is illegal
    // (e.g. `123foo`).  Consume the rest of the run so error recovery
    // skips the whole thing.
    while (isIdChar(z[i])) {
      outType[0] = T.ILLEGAL;
      i++;
    }
    return i - p;
  }

  // Resolve an identifier-shaped token to its keyword code, if any.
  // SQLite keyword matching is ASCII case-insensitive.
  function finishKeyword(
    z: string,
    p: number,
    i: number,
    outType: [TokenId],
  ): number {
    const word = z.slice(p, i);
    if (word.length >= 2) {
      const code = keywordCode.get(word.toUpperCase());
      if (code !== undefined) {
        outType[0] = code;
        return i - p;
      }
    }
    outType[0] = T.ID;
    return i - p;
  }

  // Public entry: yield successive tokens.
  function* tokenize(
    sql: string,
    { skipTrivia = true }: TokenizeOpts = {},
  ): IterableIterator<TokenSpan> {
    const out: [TokenId] = [0 as TokenId];
    let i = 0;
    const len = sql.length;
    while (i < len) {
      const n = nextToken(sql, i, out);
      const type = out[0];
      if (n === 0) break; // CC_NUL at offset i
      if (skipTrivia && (type === T.SPACE || type === T.COMMENT)) {
        i += n;
        continue;
      }
      yield { type, start: i, length: n };
      i += n;
    }
  }

  return {
    tokens: T,
    tokenName: (code: TokenId) => tokenNameMap.get(code),
    tokenize,
    _nextToken: nextToken,
    _keywordCount: keywordCode.size,
  };
}
