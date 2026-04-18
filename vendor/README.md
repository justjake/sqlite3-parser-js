# Vendored SQLite tooling

This directory holds a pinned copy of each SQLite release we've ever
patched, plus the pristine upstream baseline each one was forked from.
Previous versions are never deleted — every version that has ever
appeared here stays available under `vendor/patched/<version>/` and
`vendor/upstream/<version>/`, and its regenerated JSON dumps stay
available under `generated/<version>/`.  This gives us long-lived
reproducibility ("what exactly did the tokenizer look like when we
shipped version 0.7?") and makes the 3-way-merge history navigable.

## Layout

```
vendor/
├── manifest.json                              one source of truth — which versions
│                                              exist, what commit each is pinned to,
│                                              sha256 of every tracked file
├── submodule/
│   └── <version>/                             git submodule — full sqlite checkout
│                                              at the tag for <version>.  Only the
│                                              four files below are vendored out.
├── upstream/<version>/                        pristine files copied from submodule.
│   ├── src/parse.y                            read-only
│   └── tool/
│       ├── lemon.c                            baseline for 3-way-merge
│       ├── mkkeywordhash.c                    baseline for 3-way-merge
│       └── lempar.c                           read-only; JS engine tracks it
└── patched/<version>/                         our patched copies (3-way-merged per release)
    └── tool/
        ├── lemon.c                            adds `-J<path>` JSON dump
        └── mkkeywordhash.c                    adds `-J<path>` JSON dump
```

## Onboarding a new SQLite release

```
bun run vendor <ref>
```

The script:

1. Ensures `vendor/submodule/<ref>/` exists (adds a git submodule if not).
2. Copies `tool/{lemon,mkkeywordhash,lempar}.c` and `src/parse.y` from
   the submodule into `vendor/upstream/<ref>/`.
3. Picks the most recent previous version from `manifest.json` and
   3-way-merges (that version's patched copy) + (that version's
   upstream baseline) + (this version's upstream baseline) into
   `vendor/patched/<ref>/tool/*.c`.  On conflict, leaves `<<<<<<<`
   markers and exits non-zero; resolve by hand and re-run.
4. Updates `manifest.json` — adds an entry for `<ref>`, rehashes, sets
   `current` to `<ref>`.  Previous versions' entries stay.
5. Invokes `make generated/<ref>/{parser,keywords}.prod.json` to
   regenerate and slim the JSON dumps for the new version.

Flags:

* `--no-submodule` — skip the submodule setup.  Requires `--from`.
* `--from <dir>` — copy pristine files from a local sqlite checkout
  instead.  Useful for testing against a development tree before a
  release lands.
* `--commit <sha>` — force-record an upstream commit hash in the
  manifest instead of asking git.

The script does NOT auto-commit and does NOT run the test suite —
review the merge result, run `bun test`, and commit by hand.

## Re-generating outputs manually (Make)

```
make generated/<ver>/parser.prod.json
make generated/<ver>/keywords.prod.json
make generated/<ver>/parser.dev.json          # full dump, useful for debugging
make generated/<ver>/keywords.dev.json
make build/lemon-<ver>                        # compile patched lemon
make build/mkkeywordhash-<ver>                # compile patched mkkeywordhash
make versions                                 # list everything we have
make help
```

Make's pattern rules cover every step after the 3-way merge has
produced `vendor/patched/<ver>/tool/*.c`, so any file can be nuked and
rebuilt independently.

## Generating a reviewable `.patch` artifact

The `.patch` view is derived, not canonical — the 3-way-merge
machinery is the source of truth.  Produce it on demand:

```
diff -u vendor/upstream/3.54.0/tool/lemon.c         vendor/patched/3.54.0/tool/lemon.c
diff -u vendor/upstream/3.54.0/tool/mkkeywordhash.c vendor/patched/3.54.0/tool/mkkeywordhash.c
```
