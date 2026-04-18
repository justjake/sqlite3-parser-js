#
# Makefile for sqlite3-parser's version-parameterised build graph.
#
# The interesting targets are pattern rules over a `<version>` wildcard
# (e.g. `3.54.0`) — invoke them with the version baked into the path:
#
#   make generated/3.54.0/parser.prod.json
#   make generated/3.54.0/keywords.prod.json
#   make build/lemon-3.54.0
#
# The `bun run vendor <ref>` workflow calls this Makefile after it's
# done the 3-way merge; running Make directly is useful for
# regenerating outputs without re-running the vendor flow (e.g. after
# editing scripts/slim-dump.ts).
#
# Make targets that produce the patched files themselves are NOT here
# — they require 3-way merging with a previous version, which is
# easier to express in TypeScript.  See scripts/vendor.ts.
#

# Use bash so we can rely on `set -o pipefail` in recipes.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Keep intermediate files — debugging is easier when `parse.c` and
# `.out` sit alongside the JSON dumps.
.SECONDARY:

# Put the project root in a canonical variable so recipes that `cd`
# into workdirs still locate the repo root correctly.
ROOT := $(CURDIR)

.PHONY: help versions clean
.DEFAULT_GOAL := help

help:
	@printf '%s\n' \
	  'Pattern targets (substitute <ver> with a sqlite version like 3.54.0):' \
	  '' \
	  '  make generated/<ver>/parser.prod.json   # slim dump for bundling' \
	  '  make generated/<ver>/keywords.prod.json # slim keyword list' \
	  '  make generated/<ver>/parser.dev.json    # full dump for debugging' \
	  '  make generated/<ver>/keywords.dev.json  # full keyword list' \
	  '  make generated/<ver>/index.ts           # per-version TS wrapper' \
	  '  make build/lemon-<ver>                  # patched lemon compiled' \
	  '  make build/mkkeywordhash-<ver>          # patched mkkeywordhash' \
	  '' \
	  'Convenience targets:' \
	  '  make current                            # regenerate generated/current.ts' \
	  '  make versions                           # list all versions we have' \
	  '  make json-schemas                       # (re)generate JSON Schemas' \
	  '  make clean                              # delete build/, keep generated/' \
	  '' \
	  'AST layer:' \
	  '  make diff-ast OLD=<ver> NEW=<ver>       # grammar-shape diff' \
	  '  make ast-coverage VER=<ver>             # unhit-rule report' \
	  '' \
	  'For onboarding a new sqlite release, use:' \
	  '  bun run vendor <ref>                    # full workflow' \
	  ''

versions:
	@echo "Versions with vendored patches:"
	@ls vendor/patched/ 2>/dev/null | sed 's/^/  /' || echo "  (none)"
	@echo "Versions with generated dumps:"
	@ls generated/ 2>/dev/null | sed 's/^/  /' || echo "  (none)"

clean:
	rm -rf build/

# ---------------------------------------------------------------------------
# Compile the patched Lemon binary for a given version.  We use -O2 so
# the huge dumps (hundreds of KB of JSON) don't take forever to produce.
# ---------------------------------------------------------------------------
build/lemon-%: vendor/patched/%/tool/lemon.c
	@mkdir -p $(dir $@)
	cc -O2 -Wall -o $@ $<

# Compile the patched mkkeywordhash.  Define SQLITE_ENABLE_ORDERED_SET_AGGREGATES
# so the WITHIN keyword lands in the dump (sqlite3-parser always ships
# "maximum keyword set" dumps; runtime flag filtering selects which are
# active).
build/mkkeywordhash-%: vendor/patched/%/tool/mkkeywordhash.c
	@mkdir -p $(dir $@)
	cc -O2 -Wall -DSQLITE_ENABLE_ORDERED_SET_AGGREGATES -o $@ $<

# ---------------------------------------------------------------------------
# JSON Schemas.  scripts/json-schemas.ts materialises the TypeBox
# schemas derived from src/lempar.ts into generated/json-schema/v<N>/.
# The schema version is defined by `JSON_SCHEMA_VERSION` in that file.
# All four dump targets below depend on the schemas being present so
# validate-json can run.
# ---------------------------------------------------------------------------
JSON_SCHEMA_SOURCES := scripts/json-schemas.ts
JSON_SCHEMAS := \
  generated/json-schema/v1/parser.dev.schema.json \
  generated/json-schema/v1/parser.prod.schema.json \
  generated/json-schema/v1/keywords.dev.schema.json \
  generated/json-schema/v1/keywords.prod.schema.json

$(JSON_SCHEMAS): $(JSON_SCHEMA_SOURCES)
	bun scripts/json-schemas.ts

.PHONY: json-schemas
json-schemas: $(JSON_SCHEMAS)

# ---------------------------------------------------------------------------
# Run Lemon to produce the full (dev) parser dump for a given version.
#
# Lemon writes parse.c, parse.h, parse.out, parse.sql as side-effects
# alongside the grammar file it's pointed at.  We cd into a per-version
# workdir so those side-effects stay isolated and the caller can look at
# them if they need to.
#
# Every .json output is checked against its schema via validate-json as
# a post-step so malformed dumps never sit silently on disk.
# ---------------------------------------------------------------------------
generated/%/parser.dev.json: \
    build/lemon-% \
    vendor/upstream/%/src/parse.y \
    vendor/upstream/%/tool/lempar.c \
    scripts/validate-json.ts \
    generated/json-schema/v1/parser.dev.schema.json
	@mkdir -p generated/$*/lemon
	cp vendor/upstream/$*/tool/lempar.c generated/$*/lemon/lempar.c
	cp vendor/upstream/$*/src/parse.y   generated/$*/lemon/parse.y
	cd generated/$*/lemon && \
	  $(ROOT)/build/lemon-$* \
	    -DSQLITE_ENABLE_ORDERED_SET_AGGREGATES \
	    -J$(ROOT)/$@ \
	    parse.y
	bun scripts/validate-json.ts parser.dev $@

# mkkeywordhash has no input files — its keyword table is compiled in.
# Drop the C output; we only want the JSON.
generated/%/keywords.dev.json: build/mkkeywordhash-% \
    scripts/validate-json.ts \
    generated/json-schema/v1/keywords.dev.schema.json
	@mkdir -p $(dir $@)
	./$< -J$@ > /dev/null
	bun scripts/validate-json.ts keywords.dev $@

# ---------------------------------------------------------------------------
# Slim the dev dumps down to production variants.  Consumers that
# bundle these should import the .prod.json paths; callers who want to
# inspect rule metadata, action C code, etc. should use .dev.json.
# ---------------------------------------------------------------------------
generated/%/parser.prod.json: generated/%/parser.dev.json scripts/slim-dump.ts \
    scripts/validate-json.ts \
    generated/json-schema/v1/parser.prod.schema.json
	bun scripts/slim-dump.ts $< $@
	bun scripts/validate-json.ts parser.prod $@

generated/%/keywords.prod.json: generated/%/keywords.dev.json scripts/slim-dump.ts \
    scripts/validate-json.ts \
    generated/json-schema/v1/keywords.prod.schema.json
	bun scripts/slim-dump.ts $< $@
	bun scripts/validate-json.ts keywords.prod $@

# ---------------------------------------------------------------------------
# Per-version TS wrapper.  Codegened from scripts/emit-version-modules.ts.
# Depends on the prod dumps so the wrapper's JSON imports resolve.
# ---------------------------------------------------------------------------
generated/%/index.ts: \
    scripts/emit-version-modules.ts \
    generated/%/parser.prod.json \
    generated/%/keywords.prod.json
	bun scripts/emit-version-modules.ts $*

# ---------------------------------------------------------------------------
# The cross-version `current` re-export.  Sourced from
# vendor/manifest.json's `current` field — rebuild whenever either the
# manifest or the codegen script changes.
# ---------------------------------------------------------------------------
generated/current.ts: \
    scripts/emit-version-modules.ts \
    vendor/manifest.json
	bun scripts/emit-version-modules.ts --current

.PHONY: current
current: generated/current.ts

# ---------------------------------------------------------------------------
# AST layer helpers.  The AST code itself is version-agnostic (see
# src/ast/); these targets are just thin wrappers around the scripts
# that inspect generated/<ver>/parser.dev.json.
# ---------------------------------------------------------------------------

# Diff the grammar-shape stable keys between two parser.dev.json dumps.
#   make diff-ast OLD=3.54.0 NEW=3.55.0
.PHONY: diff-ast
diff-ast:
	@test -n "$(OLD)" -a -n "$(NEW)" \
	  || { echo 'usage: make diff-ast OLD=<ver> NEW=<ver>'; exit 2; }
	bun scripts/diff-ast.ts \
	  generated/$(OLD)/parser.dev.json \
	  generated/$(NEW)/parser.dev.json

# Report which action-bearing rules were NOT exercised by the test
# suite.  Expects tests to have written build/test/ast-coverage.json —
# a JSON array of stable keys.
#   make ast-coverage VER=3.54.0
.PHONY: ast-coverage
ast-coverage:
	@test -n "$(VER)" || { echo 'usage: make ast-coverage VER=<ver>'; exit 2; }
	bun scripts/ast-coverage.ts \
	  generated/$(VER)/parser.dev.json \
	  build/test/ast-coverage.json
