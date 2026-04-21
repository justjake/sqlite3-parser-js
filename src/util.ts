// Port of the pure token-interpretation helpers from src/util.c.
//
// Every function keeps its sqlite3* name so future readers grepping for
// the C symbol find the JS counterpart.  Where the C function takes
// output pointers or mutates in place, the JS version returns an object;
// the semantics (including error/return codes) mirror C as closely as
// possible.  Line references point into src/util.c in this checkout.
//
// Functions that in C require sqlite's allocator, Parse* error state,
// or Expr/Token structs (sqlite3DequoteExpr, sqlite3DequoteToken,
// sqlite3ExprAssignVarNumber, sqlite3DbMallocRawNN) are intentionally
// NOT ported — in JS they reduce to returning a value the caller uses
// directly.

// ---------------------------------------------------------------------------
// Return-code constants shared by the integer parsers.  Values match
// the constants in util.c:1150–1167 (sqlite3Atoi64 contract).  Marked
// `as const` so their types are literal numbers — comparisons narrow.
// ---------------------------------------------------------------------------
export const ATOI_OK = 0 as const // fits in 64-bit signed int
export const ATOI_EXCESS_TEXT = 1 as const // extra non-space chars after number
export const ATOI_OVERFLOW = 2 as const // > INT64_MAX (or malformed)
export const ATOI_AT_INT64_MIN = 3 as const // exactly 9223372036854775808 unsigned

/** Return-code union used by sqlite3Atoi64 and sqlite3DecOrHexToI64. */
export type AtoiRc =
  | typeof ATOI_OK
  | typeof ATOI_EXCESS_TEXT
  | typeof ATOI_OVERFLOW
  | typeof ATOI_AT_INT64_MIN
  | -1 // "no digits at all" — matches C's special -1 return

// ---------------------------------------------------------------------------
// Result-object types.  Named so call sites can pattern-match without
// inlining the whole shape.
// ---------------------------------------------------------------------------

/** Numeric kind reported by sqlite3DequoteNumber. */
export type NumericOp = "INTEGER" | "FLOAT"

export interface DequoteNumberOptions {
  /** Override the `_` separator char; empty string / 0 disables. */
  readonly digitSeparator?: string
}

export interface DequoteNumberResult {
  readonly op: NumericOp
  readonly text: string
  /**
   * Present iff validation failed (e.g. `12_.34`, `1234_`, `12__34`).
   * The wording mirrors sqlite3ErrorMsg at util.c:356 exactly.
   */
  readonly error?: string
}

export interface Atoi64Result {
  readonly value: bigint
  readonly rc: AtoiRc
}

export interface GetInt32Result {
  readonly value: number
  readonly ok: boolean
}

export interface AtoFResult {
  readonly value: number
  readonly rc: number
}

const INT64_MAX = 9223372036854775807n
const INT64_MIN = -9223372036854775808n

// ---------------------------------------------------------------------------
// Predicates — local replacements for the sqlite3Is* macros in
// sqliteInt.h:4675–4680.  Single-char strings come from str[i] indexing;
// `undefined` at EOI compares false against every predicate.
// ---------------------------------------------------------------------------
function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9"
}
function isXDigit(ch: string | undefined): boolean {
  if (ch === undefined) return false
  return (ch >= "0" && ch <= "9") || (ch >= "A" && ch <= "F") || (ch >= "a" && ch <= "f")
}
function isSpace(ch: string | undefined): boolean {
  if (ch === " ") return true
  if (ch === undefined) return false
  const c = ch.charCodeAt(0)
  return c >= 0x09 && c <= 0x0d
}
function isQuote(ch: string | undefined): boolean {
  return ch === "'" || ch === '"' || ch === "`" || ch === "["
}

// ---------------------------------------------------------------------------
// sqlite3Dequote — util.c:305
//
// Remove outer quotes from a SQL-quoted string ('…', "…", `…`, or […]).
// Interior doubled-quote sequences are collapsed to a single quote char
// ('' -> ', "" -> ", `` -> `).  Bracketed identifiers close on the first
// ] they see (but tokenize.c never produces ]] inside, so the classic
// loop handles them identically).  Non-quoted input is returned
// unchanged — mirroring the C no-op behaviour.
// ---------------------------------------------------------------------------
export function sqlite3Dequote(z: string): string {
  if (z.length === 0) return z
  if (!isQuote(z[0])) return z
  const close = z[0] === "[" ? "]" : z[0]
  let out = ""
  for (let i = 1; i < z.length; i++) {
    const c = z[i]
    if (c === close) {
      if (z[i + 1] === close) {
        out += close
        i++
      } else {
        break
      }
    } else {
      out += c
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// sqlite3DequoteNumber — util.c:339
//
// Strips SQLITE_DIGIT_SEPARATOR ('_' by default) from a TK_QNUMBER and
// validates that every separator has a digit (or hex digit) neighbour on
// both sides.  If validation fails, returns the sqlite error text
// (`unrecognized token: "…"`) rather than throwing — callers decide
// whether to propagate or ignore.
// ---------------------------------------------------------------------------
export function sqlite3DequoteNumber(
  z: string,
  opts: DequoteNumberOptions = {},
): DequoteNumberResult {
  const sep = opts.digitSeparator ?? "_"
  const bHex = z[0] === "0" && (z[1] === "x" || z[1] === "X")
  const neighbourOk = bHex ? isXDigit : isDigit

  let op: NumericOp = "INTEGER"
  let out = ""
  let error: string | undefined
  for (let i = 0; i < z.length; i++) {
    const c = z[i]
    if (c !== sep) {
      out += c
      if (!bHex && (c === "e" || c === "E" || c === ".")) op = "FLOAT"
      continue
    }
    if (!neighbourOk(z[i - 1]) || !neighbourOk(z[i + 1])) {
      // Match the exact wording of sqlite3ErrorMsg at util.c:356.
      error = `unrecognized token: "${z}"`
    }
  }
  return error ? { op, text: out, error } : { op, text: out }
}

// ---------------------------------------------------------------------------
// sqlite3HexToInt — util.c:1881
//
// Convert a single hex character into its 4-bit integer value.  In C
// this is a branchless bit trick; in JS the simple table lookup is both
// clearer and faster in V8.  The caller is responsible for passing only
// characters in [0-9A-Fa-f]; non-hex input yields NaN, which matches the
// "assert" precondition in C with a safer fallthrough.
// ---------------------------------------------------------------------------
export function sqlite3HexToInt(h: string | number | undefined): number {
  if (h === undefined) return NaN
  const c = typeof h === "string" ? h.charCodeAt(0) : h | 0
  if (c >= 0x30 && c <= 0x39) return c - 0x30 // '0'-'9'
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10 // 'A'-'F'
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10 // 'a'-'f'
  return NaN
}

// ---------------------------------------------------------------------------
// sqlite3HexToBlob — util.c:1899
//
// Convert a `x'hhhhhh'` literal into its byte sequence.  The C version
// takes (db, z, n) where z already points past the `x'` prefix and n
// includes the trailing `'`.  The JS version accepts the full token
// text (`x'...'` or `X'...'`) because every JS caller has it that way.
// Returns a fresh Uint8Array.  Throws if the input is not a valid blob
// literal — that's a different contract from C (which assumes the
// tokenizer already validated structure).
// ---------------------------------------------------------------------------
export function sqlite3HexToBlob(z: string): Uint8Array {
  if ((z[0] !== "x" && z[0] !== "X") || z[1] !== "'" || z[z.length - 1] !== "'") {
    throw new Error(`not a blob literal: ${JSON.stringify(z)}`)
  }
  const hex = z.slice(2, z.length - 1)
  if (hex.length % 2 !== 0) {
    throw new Error(`blob literal has odd hex digit count: ${JSON.stringify(z)}`)
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = (sqlite3HexToInt(hex[i]) << 4) | sqlite3HexToInt(hex[i + 1])
  }
  return out
}

// ---------------------------------------------------------------------------
// sqlite3Atoi64 — util.c:1168
//
// Parse a decimal integer literal into a 64-bit signed value.  Accepts
// optional leading whitespace and sign.  Does NOT accept hex — that's
// sqlite3DecOrHexToI64's job.  Overflow clamps to ±INT64_MAX and
// returns the appropriate rc code.
// ---------------------------------------------------------------------------
export function sqlite3Atoi64(z: string): Atoi64Result {
  let i = 0
  const len = z.length
  while (i < len && isSpace(z[i])) i++
  let neg = false
  if (z[i] === "-") {
    neg = true
    i++
  } else if (z[i] === "+") {
    i++
  }

  const numStart = i
  while (z[i] === "0") i++ // skip leading zeros
  let digits = ""
  while (i < len && isDigit(z[i])) {
    digits += z[i]
    i++
  }

  // No digits at all — sqlite returns rc=-1 (empty).  We preserve that.
  if (numStart === i) return { value: 0n, rc: -1 }

  // Capture a possible "extra text" rc before we clamp.
  let rc: AtoiRc = ATOI_OK
  if (i < len) {
    let j = i
    while (j < len && isSpace(z[j])) j++
    if (j < len) rc = ATOI_EXCESS_TEXT
  }

  // Parse the digit run.  BigInt handles arbitrary precision, which
  // matches the C behaviour of never truncating mid-parse.
  const u = digits.length === 0 ? 0n : BigInt(digits)

  if (u > INT64_MAX) {
    // Special cases that mirror util.c:1239–1253.
    if (u === -INT64_MIN) {
      // u == 2^63: fits if negative, special case rc=3 if positive.
      return neg ? { value: INT64_MIN, rc } : { value: INT64_MAX, rc: ATOI_AT_INT64_MIN }
    }
    return { value: neg ? INT64_MIN : INT64_MAX, rc: ATOI_OVERFLOW }
  }
  return { value: neg ? -u : u, rc }
}

// ---------------------------------------------------------------------------
// sqlite3DecOrHexToI64 — util.c:1271
//
// Dispatches hex (0x…) to a hex-specific loop, everything else to
// sqlite3Atoi64.  Mirrors C rc codes.
// ---------------------------------------------------------------------------
export function sqlite3DecOrHexToI64(z: string): Atoi64Result {
  if (z[0] === "0" && (z[1] === "x" || z[1] === "X")) {
    let i = 2
    while (z[i] === "0") i++
    const start = i
    let u = 0n
    while (i < z.length && isXDigit(z[i])) {
      u = (u << 4n) | BigInt(sqlite3HexToInt(z[i]))
      i++
    }
    // The low 64 bits are the result; anything above that is overflow.
    // util.c memcpy's `u` directly into an i64, so values >= 2^63 wrap
    // to negative — we match that with a two's-complement cast.
    const masked = BigInt.asIntN(64, u)
    if (i - start > 16) return { value: masked, rc: ATOI_OVERFLOW }
    if (i < z.length) return { value: masked, rc: ATOI_EXCESS_TEXT }
    return { value: masked, rc: ATOI_OK }
  }
  return sqlite3Atoi64(z)
}

// ---------------------------------------------------------------------------
// sqlite3GetInt32 — util.c:1305
//
// Try to fit a decimal or `0x…` literal into a signed 32-bit integer.
// Non-numeric trailing characters are *ignored* (unlike Atoi64) — this
// is how sqlite3DequoteNumber uses it to test whether a number also
// fits as EP_IntValue after separator stripping.
// ---------------------------------------------------------------------------
export function sqlite3GetInt32(z: string): GetInt32Result {
  let i = 0
  let neg = false
  if (z[i] === "-") {
    neg = true
    i++
  } else if (z[i] === "+") {
    i++
  }

  // Hex path: 0x… up to 8 hex digits, must fit in unsigned 32 without
  // setting the sign bit (same constraint as util.c:1326).
  if (z[i] === "0" && (z[i + 1] === "x" || z[i + 1] === "X") && isXDigit(z[i + 2])) {
    i += 2
    while (z[i] === "0") i++
    let u = 0
    let k = 0
    for (; k < 8 && isXDigit(z[i + k]); k++) {
      u = u * 16 + sqlite3HexToInt(z[i + k])
    }
    if ((u & 0x80000000) === 0 && !isXDigit(z[i + k])) {
      return { value: neg ? -u : u, ok: true }
    }
    return { value: 0, ok: false }
  }

  // Decimal path: up to 11 digits, must fit in signed 32 after negation.
  if (!isDigit(z[i])) return { value: 0, ok: false }
  while (z[i] === "0") i++
  let k = 0
  let v = 0
  for (; k < 11 && isDigit(z[i + k]); k++) {
    v = v * 10 + (z.charCodeAt(i + k) - 0x30)
  }
  if (k > 10) return { value: 0, ok: false }
  if (v - (neg ? 1 : 0) > 2147483647) return { value: 0, ok: false }
  return { value: neg ? -v : v, ok: true }
}

// ---------------------------------------------------------------------------
// sqlite3AtoF — util.c:873
//
// Parse an IEEE-754 decimal floating-point literal.  The C version has
// its own scaled-mantissa/exponent path (sqlite3Fp10Convert2) because
// strtod isn't portable or fast enough for every target; JS has
// Number()/parseFloat which produce identical IEEE-754 results for the
// same input, so the JS port is a thin wrapper.  We preserve sqlite's
// rc-style contract so future porters can compare.
//
// rc  > 0  — successful parse (bit flags preserved from C)
// rc  = 0  — empty/invalid input
// rc  < 0  — "trailing non-space text" sentinel
// ---------------------------------------------------------------------------
export function sqlite3AtoF(z: string): AtoFResult {
  // Strip leading whitespace to match C's loop at util.c:904–906.
  let i = 0
  while (i < z.length && isSpace(z[i])) i++
  const body = z.slice(i)
  if (body.length === 0) return { value: 0, rc: 0 }

  // Number() handles sign, decimal point, exponent, and returns ±Inf on
  // overflow (matching sqlite3Fp10Convert2 semantics).  parseFloat
  // ignores trailing garbage; we use it to detect "extra text" and
  // Number() to validate the clean case.
  const strict = Number(body.trim())
  if (Number.isNaN(strict)) {
    // Fall back to parseFloat — there may be a valid prefix with trailing junk.
    const lax = parseFloat(body)
    if (Number.isNaN(lax)) return { value: 0, rc: 0 }
    return { value: lax, rc: -1 }
  }
  return { value: strict, rc: 1 }
}
