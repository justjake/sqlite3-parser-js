# Maintaining vendored SQLite tooling — design ideas

This is a design sketch, not a decision. It captures the approach we discussed
for keeping our patched copies of `tool/lemon.c` and `tool/mkkeywordhash.c` in
sync with upstream SQLite once the project leaves the SQLite source tree and
stands on its own.

## Problem

We fork two files from SQLite — `tool/lemon.c` and `tool/mkkeywordhash.c` —
and add JSON-dump output so the JS build can consume the grammar and keyword
table. When we ship standalone we need to:

1. Vendor our patched copies at a pinned SQLite version.
2. Update those copies when a new SQLite release lands, preserving our edits.
3. Produce a reviewable record of what we changed vs. upstream.

The ideal API is roughly:

```ts
updateSqliteSource(
  ourProjectPatchesAndMetadata,
  newSqliteSourceTree,
  ourProjectOutputDir,
)
```

## Recommendation: git-native 3-way merge, with patches as derived artifacts

Store the pristine upstream copy alongside our patched copy, let git's merge
machinery handle drift, and generate `.patch` files on demand when a reviewer
wants one.

### Layout

```
vendor/
  upstream/<sqlite-version>/tool/
    lemon.c
    mkkeywordhash.c
    lempar.c           # read-only — we don't patch this, but the JS port
                       # mirrors it 1:1, so the JSON handoff expects a
                       # specific shape
  patched/tool/
    lemon.c
    mkkeywordhash.c
  manifest.json
```

`vendor/manifest.json` records:

- `sqliteVersion` — e.g. `"3.50.0"`.
- `upstreamCommit` — the commit hash from sqlite.org's fossil/git mirror.
- `upstreamUrl` — where we fetched the pristine copies from.
- `fileHashes` — SHA-256 of each `upstream/…` and `patched/…` file. Integrity
  check; catches accidental edits of the pristine copy.
- `notes` — free-form prose about the current patch (what it adds, why).

Patches are a **view**, not the source of truth. Generate on demand:

```sh
diff -u vendor/upstream/<ver>/tool/lemon.c vendor/patched/tool/lemon.c > lemon.patch
```

…whenever a reviewable artifact is wanted.

### Update flow

```
updateSqliteSource(newUpstreamDir):
  for each file in {tool/lemon.c, tool/mkkeywordhash.c}:
    old  = vendor/upstream/<current-version>/<file>
    new  = newUpstreamDir/<file>
    mine = vendor/patched/<file>

    git merge-file -p mine old new > merged.c
    if exit code != 0:
        surface conflict markers, stop — human review required

  on all-success:
    replace vendor/upstream/<new-version>/…  with new
    overwrite vendor/patched/…               with merged.c
    update manifest (version, commit, hashes)
```

Why `git merge-file`:

- Does exactly one thing — 3-way merge of three arbitrary files.
- Works outside any repository. No temp git init needed.
- Writes standard `<<<<<<< / ======= / >>>>>>>` markers on conflict.
- Exit code distinguishes clean merge (0) from conflict (number of
  conflicts).
- The full implementation of `updateSqliteSource` is ~20 lines of shelling
  out.

## Why not a quilt-style `.patch` stack

`.patch` files applied with `patch -p1` or `git apply` are the obvious
alternative. They're nicer in some ways:

- Portable — the patch file travels on its own, no vendored upstream needed.
- Explicitly reviewable — a PR shows the patch contents directly.
- Stackable — multiple independent patches can be layered.

But they fail harder on context drift. If upstream adds a line near our
insertion point, `patch --fuzz=3` might still apply, but semantic wrongness
(our code now comes after a new upstream guard that invalidates it) won't be
caught. `git apply --3way` is closer to our needs but requires the blobs to
exist in a git index, which isn't a natural fit here.

Our situation also doesn't need stacking: we have two files with a cohesive
additive change (one conceptual feature per file), not a collection of
independent features. 3-way merge is the better match.

Trade the other way when our edits are: many small hunks, reviewed
independently, or shared with someone who doesn't want our vendor tree. In
that case we can still generate the patch on demand with `diff -u`.

## Sharp edges to plan for

- **`lempar.c` isn't something we patch, but it's a dependency.** Our runtime
  engine (`src/lempar.ts`) is a 1:1 port of upstream `tool/lempar.c`. If the
  lempar template changes upstream, the JSON shape from `lemon.c` may also
  change (new tables, new constants). We should vendor a copy of
  `lempar.c` under `vendor/upstream/<ver>/tool/` and teach the update flow to
  diff it — not to merge, but to *alert* when it changes so someone audits
  `src/lempar.ts`.

- **The JSON schema our patches emit is a contract with JS.** Bumping upstream
  SQLite can add grammar symbols / rules / constants. The JS side (`src/
  parser.ts`, `src/enhanceError.ts`) reads fields by name, so new ones are
  additive; but if a bumped SQLite ever renames one, we break silently. The
  manifest should carry a `jsonSchemaVersion` that the JS loader asserts on
  load, and the update flow should verify the merged `lemon.c` / `mkkeywordhash.c`
  still emit the same schema version (or bump it deliberately).

- **Integrity check before merge.** If `vendor/patched/<file>`'s hash
  doesn't match what the manifest records, someone edited it out-of-band.
  Refuse to update until they resolve it (commit the edit and re-record the
  hash, or revert).

- **Reproducibility of pristine upstream.** Don't trust "I downloaded it
  once." Record the exact URL + commit in the manifest; the update tool
  should re-fetch and verify against a recorded hash before merging.

- **Don't skip the no-op case.** If `old == new`, we shouldn't even touch
  `vendor/patched`. The merge is a no-op but avoids spuriously re-writing
  files (and changing their mtime or line endings).

## Sketch of `updateSqliteSource`

```ts
interface VendorManifest {
  sqliteVersion: string;
  upstreamCommit: string;
  upstreamUrl: string;
  fileHashes: Record<string, string>; // relative path → sha256
  jsonSchemaVersion: number;
  notes: string;
}

interface UpdateResult {
  merged: string[];      // files with clean merges
  conflicts: string[];   // files that need manual review
  unchanged: string[];   // files where upstream didn't change
}

async function updateSqliteSource(
  vendorDir: string,      // our vendor/ tree
  newUpstreamDir: string, // a checked-out new sqlite
  newVersion: string,     // e.g. "3.51.0"
): Promise<UpdateResult> {
  const manifest = readManifest(vendorDir);
  verifyHashes(vendorDir, manifest); // bail if vendor/patched/* drifted

  const targets = ['tool/lemon.c', 'tool/mkkeywordhash.c'];
  const result: UpdateResult = { merged: [], conflicts: [], unchanged: [] };

  for (const rel of targets) {
    const oldUp  = path.join(vendorDir, 'upstream', manifest.sqliteVersion, rel);
    const newUp  = path.join(newUpstreamDir, rel);
    const mine   = path.join(vendorDir, 'patched', rel);

    if (hashFile(oldUp) === hashFile(newUp)) {
      result.unchanged.push(rel);
      continue;
    }

    const { exitCode, stdout } = await runGitMergeFile(mine, oldUp, newUp);
    const mergedPath = path.join(vendorDir, 'patched', rel);
    writeFile(mergedPath, stdout);

    if (exitCode === 0) {
      result.merged.push(rel);
    } else {
      result.conflicts.push(rel); // conflict markers are in the file
    }
  }

  // lempar.c — advisory diff, not a merge target
  if (lemparChangedUpstream(manifest, newUpstreamDir)) {
    result.conflicts.push('tool/lempar.c (audit src/lempar.ts)');
  }

  if (result.conflicts.length === 0) {
    // stage the new pristine, bump the manifest
    moveDir(newUpstreamDir, path.join(vendorDir, 'upstream', newVersion));
    writeManifest(vendorDir, {
      ...manifest,
      sqliteVersion: newVersion,
      fileHashes: rehashAll(vendorDir),
    });
  }

  return result;
}
```

## Open questions

- Where does `parse.y` live in this scheme? We don't patch it, but we do
  consume it (via `lemon.c`'s JSON dump of the grammar it parsed). Probably
  just vendored alongside `tool/lemon.c` under `vendor/upstream/<ver>/src/`
  and changes trigger a "regenerate parser.json" step rather than a merge.

- Regeneration of `fixtures/parser.json` + `fixtures/keywords.json` should be
  part of the update flow — after a successful merge, compile the patched
  tools, run them, update the fixtures, and verify the JS test suite still
  passes. That's the actual signal the update worked, not just "the merge
  was clean."

- Do we want `updateSqliteSource` to auto-commit (one commit per file merged,
  one for the manifest, one for the regenerated fixtures) or leave staging to
  the caller? Probably the latter — too easy to bury an accidental change.
