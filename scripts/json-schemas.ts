#!/usr/bin/env -S bun run
// scripts/json-schemas.ts — JSON Schemas for the generated dumps.
//
// Usage:
//   bun scripts/json-schemas.ts <schema-name> <output-path>
//
// <schema-name> is one of SCHEMA_NAMES (parser.dev / keywords.dev /
// keywords.prod).  Invoke once per schema.
//
// Consumed by:
//   * scripts/validate-json.ts — validates a defs against its schema.
//   * scripts/slim-dump.ts     — uses keywords.prod to slim the dev dump.
//   * scripts/vendor.ts        — reads JSON_SCHEMA_VERSION for manifest.
//
// There are three schemas:
//
//   * parser.dev    — full parser defs emitted by tool/lemon.c -J<file>.
//                     The runtime parser reads from the emitted parse.ts
//                     module (see scripts/emit-ts-parser.ts), NOT from
//                     this JSON, so there is no parser.prod counterpart.
//   * keywords.dev  — full keyword defs emitted by tool/mkkeywordhash.c -J<file>.
//   * keywords.prod — slim keyword defs (what the tokenizer reads at runtime).
//
// DESIGN: the .dev schemas are intentionally EXACT and STRICT
// (`additionalProperties: false` at every level).  They document the
// complete shape emitted by our patched C tools.  Another project can
// read these schemas to understand the defs format without reading the
// C source, and can use them to drive code generation in any language.
//
// The keywords.prod schema is a strict subset of keywords.dev describing
// just what the tokenizer needs at runtime; scripts/slim-dump.ts walks
// it to slim the dev dump.
//
// If the C emitter changes the set of fields, bump JSON_SCHEMA_VERSION
// and update the schemas here.  scripts/vendor.ts pins every vendored
// sqlite release to the JSON_SCHEMA_VERSION it was imported under so
// version N consumers keep working after we ship version N+1.

import Type, { type Static, type TSchema } from "typebox"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { PACKAGE_JSON, runScript } from "./utils.ts"

// Branded id types used in dev-schema field declarations below.
import type {
  RuleId as BrandedRuleId,
  SymbolId as BrandedSymbolId,
  TokenId as BrandedTokenId,
} from "../src/lempar.ts"
import type {
  KeywordEntry,
  KeywordMask as BrandedKeywordMask,
  KeywordDefs,
  MaskFlag,
} from "../src/tokenize.ts"

// ---------------------------------------------------------------------------
// Schema version.  Bump on any breaking change to any of the schemas
// below.  scripts/vendor.ts stamps this into every manifest entry so
// old releases stay pinned to the schema they were imported under.
// ---------------------------------------------------------------------------

export const JSON_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

// TypeBox's per-builder return types (TInteger, TString, TArray, …)
// don't satisfy a narrow `Record<string, Type.Any>` constraint because
// Any is its own concrete kind.  Relax to `Record<string, any>` — the
// helpers are just passthroughs to Type.Object, which accepts any
// TSchema-shaped value anyway.
type PropsMap = Record<string, any>

/** Strict object: `additionalProperties: false` — every field must be listed. */
function Strict<P extends PropsMap>(props: P) {
  return Type.Object(props, { additionalProperties: false })
}

/** `string | null` — the shape our json_string() helper in C emits. */
const NullableString = Type.Union([Type.String(), Type.Null()])

// ---------------------------------------------------------------------------
// Schema / runtime-type equality check.
//
// Bidirectional structural equality: `IsEqual<A, B>` is `true` iff `A`
// and `B` are the same shape.  Uses the "function bivariance" trick —
// TypeScript compares `<T>() => T extends A ? 1 : 2` to the same
// expression over `B`, which catches drift in either direction.
// ---------------------------------------------------------------------------

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/**
 * Wrap a TypeBox schema and assert its `Static<>` type is structurally
 * equal to the runtime type `T`.  Pattern:
 *
 *   const Foo = matches<RuntimeFoo>()(Strict({ ... }));
 *
 * If the schema gains or drops a field (or widens / narrows a field
 * type) relative to `T`, the call produces a compile error at the
 * schema expression rather than the schema silently drifting from the
 * runtime contract.
 */
function matches<T>() {
  return <S extends TSchema>(
    schema: S &
      (IsEqual<Static<S>, T> extends true
        ? unknown
        : { __schemaMismatch: { expected: T; got: Static<S> } }),
  ): S => schema as S
}

// ---------------------------------------------------------------------------
// Branded integer namespaces from src/lempar.ts.  JSON Schema can't
// represent TypeScript branding at the wire level; `Type.Unsafe<T>`
// produces a schema whose Static carries the brand, so schemas that
// reference these scalars match the runtime type exactly.
// ---------------------------------------------------------------------------

const SymbolId = Type.Unsafe<BrandedSymbolId>(Type.Integer({ minimum: 0, title: "SymbolId" }))
const TokenId = Type.Unsafe<BrandedTokenId>(Type.Integer({ minimum: 0, title: "TokenId" }))
const RuleId = Type.Unsafe<BrandedRuleId>(Type.Integer({ minimum: 0, title: "RuleId" }))
const KeywordMask = Type.Unsafe<BrandedKeywordMask>(
  Type.Integer({ minimum: 0, title: "KeywordMask" }),
)

// ===========================================================================
// PARSER DEV SCHEMA — mirrors tool/lemon.c::ReportTableJSON (patched).
// ===========================================================================

// enum symbol_type — tool/lemon.c json_symbol_type().
const ParserSymbolType = Type.Union([
  Type.Literal("TERMINAL"),
  Type.Literal("NONTERMINAL"),
  Type.Literal("MULTITERMINAL"),
  Type.Literal("UNKNOWN"),
])

// enum e_assoc — tool/lemon.c json_assoc().
const ParserAssoc = Type.Union([
  Type.Literal("LEFT"),
  Type.Literal("RIGHT"),
  Type.Literal("NONE"),
  Type.Literal("UNK"),
])

// meta.*  — lemon.c:5336..5353
const ParserDevMeta = Strict({
  /** Hardcoded "1.0" in lemon.c; lockstep with JSON_SCHEMA_VERSION. */
  lemonVersion: Type.Literal("1.0"),
  /** Integer version of the defs shape.  Matches JSON_SCHEMA_VERSION. */
  schemaVersion: Type.Literal(JSON_SCHEMA_VERSION),
  /** Input `.y` path (lemp->filename).  Nullable for robustness. */
  sourceFile: NullableString,
  /** `-D<sym>` defines that lemon actually consulted during parsing. */
  defines: Type.Array(Type.String()),
})

// constants — lemon.c:5373..5401.  All integers.  YYFALLBACK is 0|1;
// YYWILDCARD and YYERRORSYMBOL are -1 when absent.
const ParserDevConstants = Strict({
  YYNSTATE: Type.Integer(),
  YYNRULE: Type.Integer(),
  YYNRULE_WITH_ACTION: Type.Integer(),
  YYNTOKEN: Type.Integer(),
  YYNSYMBOL: Type.Integer(),
  YY_MAX_SHIFT: Type.Integer(),
  YY_MIN_SHIFTREDUCE: Type.Integer(),
  YY_MAX_SHIFTREDUCE: Type.Integer(),
  YY_ERROR_ACTION: Type.Integer(),
  YY_ACCEPT_ACTION: Type.Integer(),
  YY_NO_ACTION: Type.Integer(),
  YY_MIN_REDUCE: Type.Integer(),
  YY_MAX_REDUCE: Type.Integer(),
  YY_ACTTAB_COUNT: Type.Integer(),
  YY_SHIFT_COUNT: Type.Integer(),
  YY_SHIFT_MIN: Type.Integer(),
  YY_SHIFT_MAX: Type.Integer(),
  YY_REDUCE_COUNT: Type.Integer(),
  YY_REDUCE_MIN: Type.Integer(),
  YY_REDUCE_MAX: Type.Integer(),
  YY_MIN_DSTRCTR: Type.Integer(),
  YY_MAX_DSTRCTR: Type.Integer(),
  YYWILDCARD: Type.Integer(),
  YYERRORSYMBOL: Type.Integer(),
  YYFALLBACK: Type.Union([Type.Literal(0), Type.Literal(1)]),
})

// One entry in `symbols[]` — lemon.c:5418..5455.
// `fallback`, `datatype`, `precedence`+`assoc`, `destructor`+`destLineno`,
// and `subsym` are emitted only when the underlying struct field is set.
// Pair-correlations (e.g. precedence ⇔ assoc) are runtime invariants,
// not structural ones; we just mark them Optional here.
const ParserDevSymbol = Strict({
  id: SymbolId,
  name: Type.String(),
  type: ParserSymbolType,
  isTerminal: Type.Boolean(),
  fallback: Type.Optional(SymbolId),
  datatype: Type.Optional(Type.String()),
  dtnum: Type.Integer(),
  precedence: Type.Optional(Type.Integer()),
  assoc: Type.Optional(ParserAssoc),
  destructor: Type.Optional(Type.String()),
  destLineno: Type.Optional(Type.Integer()),
  useCnt: Type.Integer(),
  lambda: Type.Boolean(),
  subsym: Type.Optional(Type.Array(SymbolId)),
})

// One entry in `rules[i].rhs` — lemon.c:5202..5228 json_rule_rhs().
// Every rhs entry has `pos` and `alias`; then one of two shapes:
//   * regular:      symbol + name
//   * multiterminal: multi
const ParserDevMultiEntry = Strict({
  symbol: SymbolId,
  name: Type.String(),
})

const ParserDevRhsPos = Type.Union([
  Strict({
    pos: Type.Integer(),
    alias: NullableString,
    symbol: SymbolId,
    name: Type.String(),
  }),
  Strict({
    pos: Type.Integer(),
    alias: NullableString,
    multi: Type.Array(ParserDevMultiEntry),
  }),
])

// One entry in `rules[]` — lemon.c:5463..5488.
const ParserDevRule = Strict({
  id: RuleId,
  lhs: SymbolId,
  lhsName: Type.String(),
  lhsAlias: Type.Optional(Type.String()),
  nrhs: Type.Integer(),
  rhs: Type.Array(ParserDevRhsPos),
  line: Type.Integer(),
  ruleLine: Type.Integer(),
  precSymbol: Type.Optional(SymbolId),
  noCode: Type.Boolean(),
  doesReduce: Type.Boolean(),
  canReduce: Type.Boolean(),
  neverReduce: Type.Boolean(),
  lhsStart: Type.Boolean(),
  actionC: NullableString,
  codePrefix: NullableString,
  codeSuffix: NullableString,
})

// `tables` — lemon.c:5495..5574.  yyFallback is emitted only when the
// grammar has any %fallback directive (lemp->has_fallback); all five
// of the others are always emitted.
const ParserDevTables = Strict({
  yy_action: Type.Array(Type.Integer()),
  // Each slot stores the symbol id whose action lives at the
  // corresponding index in yy_action — brand so the dev shape matches
  // the runtime `ParserTables` contract in src/lempar.ts.
  yy_lookahead: Type.Array(SymbolId),
  yy_shift_ofst: Type.Array(Type.Integer()),
  yy_reduce_ofst: Type.Array(Type.Integer()),
  yy_default: Type.Array(Type.Integer()),
  yyFallback: Type.Optional(Type.Array(TokenId)),
})

// Top-level parser.dev shape — lemon.c:5335..5576.
const ParserDevSchema = Strict({
  meta: ParserDevMeta,
  name: NullableString,
  tokenPrefix: NullableString,
  tokenType: NullableString,
  varType: NullableString,
  start: NullableString,
  stackSize: NullableString,
  reallocFunc: NullableString,
  freeFunc: NullableString,
  stackSizeLimit: NullableString,
  extraArg: NullableString,
  extraContext: NullableString,
  constants: ParserDevConstants,
  preamble: NullableString,
  syntaxError: NullableString,
  stackOverflow: NullableString,
  parseFailure: NullableString,
  parseAccept: NullableString,
  extraCode: NullableString,
  tokenDestructor: NullableString,
  defaultDestructor: NullableString,
  symbols: Type.Array(ParserDevSymbol),
  rules: Type.Array(ParserDevRule),
  tables: ParserDevTables,
})

// ===========================================================================
// KEYWORDS DEV SCHEMA — mirrors tool/mkkeywordhash.c::dump_keywords_json.
// ===========================================================================

// The 24 feature-flag names hardcoded in aMaskNames[] (mkkeywordhash.c:430).
// maskFlags must list exactly these 24 keys — one per feature group the
// SQLite build system can compile in or out.  Adding a flag to the C
// source is a schema bump.
const KW_MASK_FLAG_NAMES = [
  "ALTER",
  "ALWAYS",
  "ANALYZE",
  "ATTACH",
  "AUTOINCR",
  "CAST",
  "COMPOUND",
  "CONFLICT",
  "EXPLAIN",
  "FKEY",
  "PRAGMA",
  "REINDEX",
  "SUBQUERY",
  "TRIGGER",
  "VACUUM",
  "VIEW",
  "VTAB",
  "AUTOVACUUM",
  "CTE",
  "UPSERT",
  "WINDOWFUNC",
  "GENCOL",
  "RETURNING",
  "ORDERSET",
] as const

// The cast preserves the literal-keyed shape so `Static<>` produces
// `{ ALTER: KeywordMask; ALWAYS: KeywordMask; … }` — structurally
// equal to `Record<MaskFlag, KeywordMask>` — instead of a loose
// `Record<string, KeywordMask>`.  Runtime behaviour is unchanged
// (`Object.fromEntries` returns an object keyed by the 24 flag names
// regardless of the TS cast).
type MaskFlagsProps = { [K in MaskFlag]: typeof KeywordMask }
const KeywordsDevMaskFlags = Strict(
  Object.fromEntries(KW_MASK_FLAG_NAMES.map((n) => [n, KeywordMask])) as MaskFlagsProps,
)

const KeywordsDevMeta = Strict({
  /** Hardcoded "tool/mkkeywordhash.c" in the emitter. */
  sourceFile: Type.String(),
  /** Integer version of the defs shape.  Matches JSON_SCHEMA_VERSION. */
  schemaVersion: Type.Literal(JSON_SCHEMA_VERSION),
  /** Number of keyword entries before main() filters out mask==0. */
  keywordCount: Type.Integer(),
  /** Flag-name → bit-value map; flag names are keys of this object. */
  maskFlags: KeywordsDevMaskFlags,
})

// One keyword entry.  `token` holds the parser symbol name without the
// "TK_" prefix — see the header block in vendor/patched/.../mkkeywordhash.c
// for why the prefix is stripped in C.  `flags[]` holds the symbolic
// flag names decoded from `mask`; any bits unrecognised by aMaskNames[]
// are emitted as hex literals like "0x10000000" (mkkeywordhash.c:514).
const KeywordsDevEntry = Strict({
  name: Type.String(),
  token: Type.String(),
  priority: Type.Integer(),
  mask: KeywordMask,
  flags: Type.Array(Type.String()),
})

const KeywordsDevSchema = Strict({
  meta: KeywordsDevMeta,
  keywords: Type.Array(KeywordsDevEntry),
})

// ===========================================================================
// KEYWORDS PROD SCHEMA — strict subset of .dev that the JS runtime reads.
// Matches src/tokenize.ts::KeywordDefs minus the debug-only fields.
// ===========================================================================

const KeywordsProdMeta = matches<KeywordDefs["meta"]>()(
  Strict({
    maskFlags: KeywordsDevMaskFlags,
  }),
)

// Prod drops the decoded `flags: string[]` array in favour of the raw
// `mask: number` (bit values defined by `meta.maskFlags`), and strips
// the redundant `TK_` prefix from `tokenName` — renaming the field to
// `token` to signal that the value is the parser symbol name directly.
// See scripts/slim-dump.ts for the pre-Clean transform that builds
// this shape out of the dev defs.
const KeywordsProdEntry = matches<KeywordEntry>()(
  Strict({
    name: Type.String(),
    token: Type.String(),
    mask: KeywordMask,
  }),
)

const KeywordsProdSchema = matches<KeywordDefs>()(
  Strict({
    meta: KeywordsProdMeta,
    keywords: Type.Array(KeywordsProdEntry),
  }),
)

// ---------------------------------------------------------------------------
// Schema registry.  Keys match what validate-json.ts accepts as its
// first positional argument.
// ---------------------------------------------------------------------------

export const SCHEMAS = {
  "parser.dev": ParserDevSchema,
  "keywords.dev": KeywordsDevSchema,
  "keywords.prod": KeywordsProdSchema,
} as const

export type SchemaName = keyof typeof SCHEMAS

export const SCHEMA_NAMES: readonly SchemaName[] = Object.keys(SCHEMAS) as SchemaName[]

/** Filesystem path to the directory holding the generated schemas. */
export function schemaDir(root: string): string {
  return join(root, "generated", "json-schema", `v${JSON_SCHEMA_VERSION}`)
}

/** Filesystem path to one schema's JSON file. */
export function schemaPath(root: string, name: SchemaName): string {
  return join(schemaDir(root), `${name}.schema.json`)
}

// ---------------------------------------------------------------------------
// CLI entry — write one schema as pretty JSON.  Invoke once per schema.
// ---------------------------------------------------------------------------

await runScript(
  import.meta.main,
  { usage: `usage: bun scripts/json-schemas.ts <${SCHEMA_NAMES.join("|")}> <output-path>` },
  ({ positionals }) => {
    const [name, outPath] = positionals
    if (!name || !outPath || !(name in SCHEMAS)) {
      console.error(`usage: bun scripts/json-schemas.ts <${SCHEMA_NAMES.join("|")}> <output-path>`)
      process.exit(2)
    }

    const schema = SCHEMAS[name as SchemaName]
    const annotated = {
      $schema: "http://json-schema.org/draft-07/schema#",
      // Version segment sits BEFORE the schema name so that a future
      // schema-version bump can freely drop, rename, or add schemas
      // without stepping on v1's $id namespace.
      $id: `${PACKAGE_JSON.name}/v${JSON_SCHEMA_VERSION}/${name}`,
      title: name,
      ...schema,
    }
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(annotated, null, 2) + "\n")
    console.error(`wrote ${outPath}`)
  },
)
