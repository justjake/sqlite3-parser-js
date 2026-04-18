#!/usr/bin/env -S bun run
// scripts/json-schemas.ts — JSON Schemas for the generated dumps.
//
// The source of truth for what the runtime reads is src/lempar.ts
// (parser dumps) and src/tokenize.ts (keywords dumps).  This script
// translates those TypeScript types into JSON Schema form via TypeBox
// and writes one file per schema into:
//
//   generated/json-schema/v<JSON_SCHEMA_VERSION>/<name>.schema.json
//
// Consumed by scripts/validate-json.ts and by scripts/vendor.ts (the
// latter only reads `JSON_SCHEMA_VERSION` so it can record the version
// in vendor/manifest.json).
//
// There are four schemas:
//
//   * parser.dev   — full Lemon dump (tool/lemon.c -J<file> output)
//   * parser.prod  — slim dump produced by scripts/slim-dump.ts
//   * keywords.dev — full mkkeywordhash dump
//   * keywords.prod — slim keywords dump
//
// The `.prod` schemas are strict supersets of what the runtime actually
// reads.  The `.dev` schemas are intentionally permissive: they require
// the same runtime-critical fields, but tolerate the many extra fields
// Lemon emits (codegen context, actionC snippets, rule line numbers,
// etc.) by setting `additionalProperties: true` at every level.
//
// To add a new field the runtime depends on: (1) add it to the relevant
// TypeBox object below, (2) add it to scripts/slim-dump.ts's keep-set,
// and (3) bump JSON_SCHEMA_VERSION if the change is not backwards-
// compatible (existing prod dumps would fail validation).

import Type from 'typebox';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Schema version.  Bump when a breaking change is introduced to any of
// the schemas below.  scripts/vendor.ts records this in manifest.json
// alongside each vendored sqlite release.
// ---------------------------------------------------------------------------

export const JSON_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

// TypeBox's per-builder return types (TInteger, TString, TArray, …)
// don't satisfy a narrow `Record<string, Type.Any>` constraint because
// Any is its own concrete kind.  Relax to `Record<string, any>` — the
// helpers are just passthroughs to Type.Object, which accepts any
// TSchema-shaped value anyway.
type PropsMap = Record<string, any>;

/** Strict object — disallows properties not listed. */
function Strict<P extends PropsMap>(props: P) {
  return Type.Object(props, { additionalProperties: false });
}

/** Loose object — tolerates extra properties (used for .dev schemas). */
function Loose<P extends PropsMap>(props: P) {
  return Type.Object(props, { additionalProperties: true });
}

// ---------------------------------------------------------------------------
// Branded integer namespaces from src/lempar.ts.  JSON Schema can't
// represent the TypeScript branding; the brand is purely a compile-time
// aid.  All three ids are non-negative integers at runtime.
// ---------------------------------------------------------------------------

const SymbolId = Type.Integer({ minimum: 0, title: 'SymbolId' });
const TokenId  = Type.Integer({ minimum: 0, title: 'TokenId'  });
const RuleId   = Type.Integer({ minimum: 0, title: 'RuleId'   });

// ---------------------------------------------------------------------------
// Parser dump — fields required by src/lempar.ts::LemonDump.
// These are what the LALR engine actually reads.
// ---------------------------------------------------------------------------

// LemonConstants (lempar.ts:78)
const ParserConstantsCore = {
  YYNSTATE:           Type.Integer(),
  YYNRULE:            Type.Integer(),
  YYNTOKEN:           Type.Integer(),
  YYNSYMBOL:          Type.Integer(),
  YY_MAX_SHIFT:       Type.Integer(),
  YY_MIN_SHIFTREDUCE: Type.Integer(),
  YY_MAX_SHIFTREDUCE: Type.Integer(),
  YY_ERROR_ACTION:    Type.Integer(),
  YY_ACCEPT_ACTION:   Type.Integer(),
  YY_NO_ACTION:       Type.Integer(),
  YY_MIN_REDUCE:      Type.Integer(),
  YY_MAX_REDUCE:      Type.Integer(),
  YY_ACTTAB_COUNT:    Type.Integer(),
  YY_SHIFT_COUNT:     Type.Integer(),
  YY_REDUCE_COUNT:    Type.Integer(),
  YYWILDCARD:         Type.Integer(),
  YYFALLBACK:         Type.Union([Type.Literal(0), Type.Literal(1)]),
};

// LemonTables (lempar.ts:110)
const ParserTablesCore = {
  yy_action:      Type.Array(Type.Integer()),
  yy_lookahead:   Type.Array(SymbolId),
  yy_shift_ofst:  Type.Array(Type.Integer()),
  yy_reduce_ofst: Type.Array(Type.Integer()),
  yy_default:     Type.Array(Type.Integer()),
  yyFallback:     Type.Optional(Type.Array(TokenId)),
};

// DumpSymbol (lempar.ts:121)
const ParserSymbolCore = {
  id:         SymbolId,
  name:       Type.String(),
  isTerminal: Type.Boolean(),
};

// Single RHS alternative inside a `multi` (lempar.ts:132).
const ParserRhsMultiEntryProd = Strict({
  symbol: SymbolId,
  name:   Type.String(),
});
const ParserRhsMultiEntryDev = Loose({
  symbol: SymbolId,
  name:   Type.String(),
});

// DumpRhsPos (lempar.ts:127)
const ParserRhsPosCore = {
  pos:    Type.Integer(),
  symbol: Type.Optional(SymbolId),
  multi:  Type.Optional(Type.Array(ParserRhsMultiEntryProd)),
  name:   Type.Optional(Type.String()),
};
const ParserRhsPosDevCore = {
  pos:    Type.Integer(),
  symbol: Type.Optional(SymbolId),
  multi:  Type.Optional(Type.Array(ParserRhsMultiEntryDev)),
  name:   Type.Optional(Type.String()),
};

// DumpRule (lempar.ts:136)
const ParserRuleCore = {
  id:         RuleId,
  lhs:        SymbolId,
  lhsName:    Type.String(),
  nrhs:       Type.Integer(),
  rhs:        Type.Array(Strict(ParserRhsPosCore)),
  doesReduce: Type.Boolean(),
};
const ParserRuleDevCore = {
  id:         RuleId,
  lhs:        SymbolId,
  lhsName:    Type.String(),
  nrhs:       Type.Integer(),
  rhs:        Type.Array(Loose(ParserRhsPosDevCore)),
  doesReduce: Type.Boolean(),
};

// ---------------------------------------------------------------------------
// Parser .prod — exact shape of LemonDump as declared in src/lempar.ts.
// ---------------------------------------------------------------------------

const ParserProdSchema = Strict({
  constants: Strict(ParserConstantsCore),
  tables:    Strict(ParserTablesCore),
  symbols:   Type.Array(Strict(ParserSymbolCore)),
  rules:     Type.Array(Strict(ParserRuleCore)),
});

// ---------------------------------------------------------------------------
// Parser .dev — LemonDump plus all the other fields lemon emits.
// Object-level `additionalProperties: true` (via Loose) lets us require
// the runtime-critical fields without spelling out every extra.
// ---------------------------------------------------------------------------

const ParserDevSchema = Loose({
  constants: Loose(ParserConstantsCore),
  tables:    Loose(ParserTablesCore),
  symbols:   Type.Array(Loose(ParserSymbolCore)),
  rules:     Type.Array(Loose(ParserRuleDevCore)),
});

// ---------------------------------------------------------------------------
// Keywords dump — fields required by src/tokenize.ts::KeywordsDump.
// The runtime reads `meta.maskFlags`, `keywords[].name`,
// `keywords[].tokenName`, and `keywords[].flags`.  The .prod dump is
// trimmed to just these; the .dev dump also carries priority and mask.
// ---------------------------------------------------------------------------

const MaskFlagName = Type.String({ minLength: 1 });

const KeywordsMetaCore = {
  maskFlags: Type.Record(MaskFlagName, Type.Integer()),
};
const KeywordsMetaDevCore = {
  sourceFile:   Type.String(),
  schemaVersion: Type.Integer(),
  keywordCount: Type.Integer(),
  maskFlags:    Type.Record(MaskFlagName, Type.Integer()),
};

const KeywordEntryCore = {
  name:      Type.String(),
  tokenName: Type.String(),
  flags:     Type.Array(MaskFlagName),
};
const KeywordEntryDevCore = {
  name:      Type.String(),
  tokenName: Type.String(),
  priority:  Type.Integer(),
  mask:      Type.Integer(),
  flags:     Type.Array(MaskFlagName),
};

const KeywordsProdSchema = Strict({
  meta:     Strict(KeywordsMetaCore),
  keywords: Type.Array(Strict(KeywordEntryCore)),
});

const KeywordsDevSchema = Loose({
  meta:     Loose(KeywordsMetaDevCore),
  keywords: Type.Array(Loose(KeywordEntryDevCore)),
});

// ---------------------------------------------------------------------------
// Schema registry.  Keys match what validate-json.ts accepts as its
// first positional argument.
// ---------------------------------------------------------------------------

export const SCHEMAS = {
  'parser.dev':   ParserDevSchema,
  'parser.prod':  ParserProdSchema,
  'keywords.dev': KeywordsDevSchema,
  'keywords.prod': KeywordsProdSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;

export const SCHEMA_NAMES: readonly SchemaName[] =
  Object.keys(SCHEMAS) as SchemaName[];

/** Filesystem path to the directory holding the generated schemas. */
export function schemaDir(root: string): string {
  return join(root, 'generated', 'json-schema', `v${JSON_SCHEMA_VERSION}`);
}

/** Filesystem path to one schema's JSON file. */
export function schemaPath(root: string, name: SchemaName): string {
  return join(schemaDir(root), `${name}.schema.json`);
}

// ---------------------------------------------------------------------------
// CLI entry — write each schema as pretty JSON.
// ---------------------------------------------------------------------------

function main(): void {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
  const dir = schemaDir(root);
  mkdirSync(dir, { recursive: true });

  for (const name of SCHEMA_NAMES) {
    const schema = SCHEMAS[name];
    const annotated = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: `claude-lemon/${name}/v${JSON_SCHEMA_VERSION}`,
      title: name,
      ...schema,
    };
    const path = schemaPath(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(annotated, null, 2) + '\n');
    console.log(`wrote ${path}`);
  }
  console.log(`\nJSON_SCHEMA_VERSION = ${JSON_SCHEMA_VERSION}`);
}

if (import.meta.main) {
  main();
}
