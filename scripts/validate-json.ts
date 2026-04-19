#!/usr/bin/env -S bun run
// scripts/validate-json.ts — check a generated defs against its schema.
//
//   bun scripts/validate-json.ts <schema-name> <path-to-file>
//
// Where <schema-name> is one of:
//
//   parser.dev, parser.prod, keywords.dev, keywords.prod
//
// Exits 0 on success and 1 (with a list of validation errors) on
// failure.  Used by the Makefile as a post-step on every target that
// produces a .json defs so regressions surface at build time rather
// than at runtime in a bundle somewhere.
//
// The schema is loaded from
// `generated/json-schema/v<JSON_SCHEMA_VERSION>/<name>.schema.json`;
// that file is produced by scripts/json-schemas.ts.  If the file
// doesn't exist, run `bun scripts/json-schemas.ts` first.

import { readFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { Check, Errors } from "typebox/value"

import { JSON_SCHEMA_VERSION, SCHEMA_NAMES, schemaPath, type SchemaName } from "./json-schemas.ts"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")

function usage(): never {
  console.error(
    `usage: bun scripts/validate-json.ts <schema-name> <path-to-file>\n` +
      `  schema-name: one of ${SCHEMA_NAMES.join(", ")}`,
  )
  process.exit(2)
}

function main(): void {
  const [, , schemaName, filePath] = process.argv
  if (!schemaName || !filePath) usage()
  if (!SCHEMA_NAMES.includes(schemaName as SchemaName)) {
    console.error(`unknown schema "${schemaName}"`)
    usage()
  }

  const sp = schemaPath(ROOT, schemaName as SchemaName)
  if (!existsSync(sp)) {
    console.error(
      `schema file not found: ${sp}\n` + `run \`bun scripts/json-schemas.ts\` to (re)generate it.`,
    )
    process.exit(2)
  }

  const schema = JSON.parse(readFileSync(sp, "utf8"))
  const data = JSON.parse(readFileSync(filePath, "utf8"))

  if (Check(schema, data)) {
    console.log(`ok: ${filePath} conforms to ${schemaName} (schema v${JSON_SCHEMA_VERSION})`)
    return
  }

  const errors = Errors(schema, data)
  console.error(
    `validation failed: ${filePath} does not conform to ${schemaName} ` +
      `(schema v${JSON_SCHEMA_VERSION})`,
  )
  for (const e of errors) {
    const path = e.instancePath || "(root)"
    console.error(`  ${path}: ${e.message}`)
  }
  console.error(`\n${errors.length} error(s)`)
  process.exit(1)
}

main()
