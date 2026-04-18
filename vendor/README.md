# Vendored SQLite tooling

This directory holds a pinned copy of the two SQLite tool files we've
patched, plus the pristine upstream baseline they were forked from.
Together they let us 3-way-merge onto future SQLite releases without
losing our edits, and they produce on-demand `.patch` artifacts when a
reviewer wants a one-file summary of our divergence.

## Layout

```
vendor/
├── manifest.json                              what upstream commit we're on
├── upstream/
│   └── <sqlite-version>/
│       ├── tool/
│       │   ├── lemon.c                        pristine — our patched copy's baseline
│       │   ├── mkkeywordhash.c                pristine — our patched copy's baseline
│       │   └── lempar.c                       pristine, read-only (no patches; the JS
│       │                                      engine in src/lempar.ts tracks this file)
│       └── src/
│           └── parse.y                        pristine, read-only (data dependency)
└── patched/
    └── tool/
        ├── lemon.c                            ours — adds `-J<path>` JSON dump
        └── mkkeywordhash.c                    ours — adds `-J<path>` JSON dump
```

The two `patched/tool/*.c` files are what you compile to regenerate
`generated/parser.json` and `generated/keywords.json`.

## Updating to a new SQLite release

See `scripts/updateSqliteSource.ts`.  In short:

```
bun scripts/updateSqliteSource.ts <new-sqlite-checkout> <new-version>
```

It:

1. Verifies `vendor/patched/*` hashes against the manifest (catches
   accidental out-of-band edits).
2. Runs `git merge-file` on each file we patch, using the current
   upstream baseline as the merge ancestor.
3. On clean merges: overwrites `vendor/patched/*` with the merged
   result, copies the new upstream sources into `vendor/upstream/<new-version>/`,
   and updates the manifest.
4. On conflicts: leaves `<<<<<<<` markers in the patched file and
   exits non-zero.  Resolve manually, then re-run with the same
   arguments to commit the new baseline.
5. Diffs `tool/lempar.c` against its baseline; if it changed, reports
   it as an *advisory* conflict so someone audits `src/lempar.ts`.

## Regenerating the JSON dumps after a merge

After a successful update, rebuild the dumps:

```
cc -O2 -o ./bin/lemon           vendor/patched/tool/lemon.c
cc -O2 -o ./bin/mkkeywordhash   vendor/patched/tool/mkkeywordhash.c -DSQLITE_ENABLE_ORDERED_SET_AGGREGATES
./bin/lemon           -DSQLITE_ENABLE_ORDERED_SET_AGGREGATES -Jgenerated/parser.json   vendor/upstream/<version>/src/parse.y
./bin/mkkeywordhash                                          -Jgenerated/keywords.json
bun test
```

If `bun test` still passes, the update landed cleanly.

## Generating a `.patch` view

For review PRs or external consumers who don't want the vendor tree:

```
diff -u vendor/upstream/<ver>/tool/lemon.c vendor/patched/tool/lemon.c \
  > patches/lemon.patch
diff -u vendor/upstream/<ver>/tool/mkkeywordhash.c vendor/patched/tool/mkkeywordhash.c \
  > patches/mkkeywordhash.patch
```

The 3-way-merge source of truth remains the `vendor/` tree — `.patch`
files are a derived artifact.
