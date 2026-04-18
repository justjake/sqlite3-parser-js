// updateSqliteSource — move our vendored patched tools onto a new
// SQLite release, preserving our edits via 3-way merge.
//
// Usage:
//     bun scripts/updateSqliteSource.ts <new-upstream-dir> <new-version>
//
// where <new-upstream-dir> is a checkout of the new SQLite source tree
// (i.e. the directory that contains `tool/lemon.c`, `tool/mkkeywordhash.c`,
// `tool/lempar.c`, `src/parse.y`) and <new-version> is the tag/label
// to record in the manifest, e.g. "3.55.0".
//
// Algorithm:
//   1. Read vendor/manifest.json.
//   2. Verify the recorded sha256 of every vendor/patched/* and
//      vendor/upstream/<current>/* still matches the file on disk —
//      catches out-of-band edits.
//   3. For each merge target:
//        a. If upstream didn't change, mark "unchanged" and move on.
//        b. Otherwise run `git merge-file -p mine base new > merged`.
//           - exit 0 → clean merge; overwrite vendor/patched/* with merged.
//           - exit >0 → conflict; the merged file contains `<<<<<<<`
//             markers.  Write it out anyway, surface the conflict, and
//             tell the caller to resolve + re-run.
//   4. Diff the pristine tool/lempar.c and src/parse.y between the
//      current vendored baseline and the new upstream copy.  We don't
//      merge these — we just flag a *review task* if they changed,
//      since src/lempar.ts mirrors lempar.c shape-for-shape and the
//      JSON schema mirrors parse.y's token / rule set.
//   5. On all-success, move vendor/upstream/<current>/ out of the way
//      and install the new pristine sources under
//      vendor/upstream/<new-version>/, then rewrite manifest.json.
//
// The script does NOT auto-commit, and it does NOT regenerate
// `generated/parser.json` or `generated/keywords.json` — rebuild the
// patched tools and re-run them manually (see vendor/README.md), and
// then `bun test` to verify.  Too easy to bury a quiet regression
// otherwise.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

interface VendorManifest {
  sqliteVersion: string;
  upstreamCommit: string;
  upstreamUrl: string;
  jsonSchemaVersion: number;
  notes: string;
  /** relative-from-vendor-root → sha256 hex */
  fileHashes: Record<string, string>;
}

interface UpdateResult {
  merged: string[];
  conflicts: string[];
  unchanged: string[];
  advisory: string[];
}

// ---------------------------------------------------------------------------
// I/O helpers.
// ---------------------------------------------------------------------------

function sha256(path: string): string {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

function readManifest(vendorDir: string): VendorManifest {
  return JSON.parse(readFileSync(join(vendorDir, 'manifest.json'), 'utf8'));
}

function writeManifest(vendorDir: string, m: VendorManifest): void {
  writeFileSync(
    join(vendorDir, 'manifest.json'),
    JSON.stringify(m, null, 2) + '\n',
  );
}

/**
 * Abort if any recorded file's sha256 doesn't match what's on disk.
 * This stops us from silently overwriting local edits that somebody
 * forgot to commit.
 */
function verifyHashes(vendorDir: string, m: VendorManifest): void {
  const mismatches: string[] = [];
  for (const [rel, recorded] of Object.entries(m.fileHashes)) {
    const path = join(vendorDir, rel);
    if (!existsSync(path)) {
      mismatches.push(`${rel}: missing`);
      continue;
    }
    const actual = sha256(path);
    if (actual !== recorded) {
      mismatches.push(`${rel}: sha256 ${actual.slice(0, 12)}… (expected ${recorded.slice(0, 12)}…)`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      'vendor/ has drifted from manifest.json:\n  ' +
      mismatches.join('\n  ') +
      '\nCommit or revert the local changes, then re-record hashes by running this script again.',
    );
  }
}

// ---------------------------------------------------------------------------
// git merge-file wrapper.  We don't need a git repo — git merge-file
// works on arbitrary paths.
// ---------------------------------------------------------------------------

interface MergeResult {
  /** Exit code: 0 = clean, N>0 = N conflicts, <0 = error. */
  exitCode: number;
  /** Merged content (always populated, even on conflict). */
  text: string;
}

function gitMergeFile(
  minePath: string,
  basePath: string,
  newPath: string,
): MergeResult {
  const r = spawnSync(
    'git',
    [
      'merge-file',
      '-p',                   // print merged to stdout, don't modify `mine`
      '-L', 'patched',
      '-L', 'upstream (baseline)',
      '-L', 'upstream (new)',
      minePath,
      basePath,
      newPath,
    ],
    { encoding: 'utf8' },
  );
  if (r.error) throw r.error;
  return { exitCode: r.status ?? -1, text: r.stdout };
}

// ---------------------------------------------------------------------------
// Main update flow.
// ---------------------------------------------------------------------------

/** Files we actively patch — 3-way-merged. */
const MERGE_TARGETS = [
  'tool/lemon.c',
  'tool/mkkeywordhash.c',
] as const;

/**
 * Files we copy from upstream but do NOT patch.  Changes trigger an
 * advisory review (src/lempar.ts for lempar.c, src/tokenize.ts +
 * scripts/slim-dump.ts audit for parse.y).
 */
const ADVISORY_TARGETS: ReadonlyArray<{ rel: string; auditHint: string }> = [
  { rel: 'tool/lempar.c', auditHint: 'diff against src/lempar.ts — parser-engine port tracks this file.' },
  { rel: 'src/parse.y',   auditHint: 'regenerate generated/parser.json and run `bun test` — grammar changes here may need schema-slim updates.' },
];

export async function updateSqliteSource(
  vendorDir: string,
  newUpstreamDir: string,
  newVersion: string,
): Promise<UpdateResult> {
  const manifest = readManifest(vendorDir);
  verifyHashes(vendorDir, manifest);

  const currVer = manifest.sqliteVersion;
  const result: UpdateResult = {
    merged: [],
    conflicts: [],
    unchanged: [],
    advisory: [],
  };

  // ---- 1. 3-way-merge each patched file ---------------------------
  for (const rel of MERGE_TARGETS) {
    const base = join(vendorDir, 'upstream', currVer, rel);
    const mine = join(vendorDir, 'patched', rel);
    const next = join(newUpstreamDir, rel);

    if (!existsSync(next)) {
      throw new Error(`Expected new upstream file at ${next}`);
    }
    if (sha256(base) === sha256(next)) {
      result.unchanged.push(rel);
      continue;
    }

    const merge = gitMergeFile(mine, base, next);
    writeFileSync(mine, merge.text);
    if (merge.exitCode === 0) {
      result.merged.push(rel);
    } else {
      result.conflicts.push(rel);
    }
  }

  // ---- 2. Advisory diffs for read-only vendored files -------------
  for (const { rel, auditHint } of ADVISORY_TARGETS) {
    const base = join(vendorDir, 'upstream', currVer, rel);
    const next = join(newUpstreamDir, rel);
    if (!existsSync(next)) {
      throw new Error(`Expected new upstream file at ${next}`);
    }
    if (sha256(base) !== sha256(next)) {
      result.advisory.push(`${rel}: ${auditHint}`);
    }
  }

  // ---- 3. Install the new pristine tree & rewrite manifest --------
  // Only proceed if there were no hard conflicts.  Advisory items are
  // not a blocker — they just need post-merge review.
  if (result.conflicts.length === 0) {
    const newUpstreamVendorDir = join(vendorDir, 'upstream', newVersion);

    // Copy only the files we vendor.  Skipping the rest of the sqlite
    // source keeps the repo lean.
    const toCopy = [
      ...MERGE_TARGETS.map((r) => r),
      ...ADVISORY_TARGETS.map((a) => a.rel),
    ];
    for (const rel of toCopy) {
      const src = join(newUpstreamDir, rel);
      const dst = join(newUpstreamVendorDir, rel);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst);
    }

    // If we've moved to a new version dir, drop the old one.
    if (newVersion !== currVer) {
      const oldDir = join(vendorDir, 'upstream', currVer);
      if (existsSync(oldDir)) rmSync(oldDir, { recursive: true, force: true });
    }

    // Rehash everything we track.
    const fileHashes: Record<string, string> = {};
    for (const rel of MERGE_TARGETS) {
      fileHashes[`patched/${rel}`] = sha256(join(vendorDir, 'patched', rel));
    }
    for (const rel of MERGE_TARGETS) {
      fileHashes[`upstream/${newVersion}/${rel}`] =
        sha256(join(newUpstreamVendorDir, rel));
    }
    for (const { rel } of ADVISORY_TARGETS) {
      fileHashes[`upstream/${newVersion}/${rel}`] =
        sha256(join(newUpstreamVendorDir, rel));
    }

    writeManifest(vendorDir, {
      ...manifest,
      sqliteVersion: newVersion,
      fileHashes,
      // upstreamCommit / upstreamUrl / notes are caller responsibility;
      // we leave them alone so human review updates them deliberately.
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function fmtList(rs: readonly string[]): string {
  return rs.length === 0 ? '(none)' : '\n  ' + rs.join('\n  ');
}

async function main(): Promise<void> {
  const [, , newUpstreamDir, newVersion] = process.argv;
  if (!newUpstreamDir || !newVersion) {
    console.error('usage: bun scripts/updateSqliteSource.ts <new-upstream-dir> <new-version>');
    process.exit(2);
  }
  const vendorDir = join(
    dirname(new URL(import.meta.url).pathname),
    '..',
    'vendor',
  );
  const result = await updateSqliteSource(vendorDir, newUpstreamDir, newVersion);

  console.log(`merged cleanly:   ${fmtList(result.merged)}`);
  console.log(`unchanged:        ${fmtList(result.unchanged)}`);
  console.log(`conflicts:        ${fmtList(result.conflicts)}`);
  console.log(`advisory review:  ${fmtList(result.advisory)}`);

  if (result.conflicts.length > 0) {
    console.error(
      '\nMerge had conflicts.  Resolve <<<<<<< markers in vendor/patched/*.c, ' +
      're-run this script with the same arguments to commit the new baseline.',
    );
    process.exit(1);
  }
  if (result.advisory.length > 0) {
    console.error(
      '\nAdvisory review items present.  Read the hints above and update the ' +
      'corresponding JS source before regenerating the JSON dumps.',
    );
  }
  console.log(
    '\nNext: rebuild the patched tools, regenerate ' +
    'generated/parser.json + generated/keywords.json (see vendor/README.md), ' +
    'then run `bun test`.',
  );
}

// Only run main if this file was invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
