#!/usr/bin/env -S bun run
// scripts/vendor.ts — the `bun run vendor <ref>` entry point.
//
// Onboards a new SQLite release into this package (name taken from
// package.json via PACKAGE_NAME):
//
//   1. Ensures vendor/submodule/<ref>/ exists.  If missing, adds it as
//      a git submodule pointing at sqlite.org's GitHub mirror and
//      checks out the requested tag.  `--no-submodule` skips this for
//      air-gapped / testing flows that bring their own source tree
//      (pass `--from <path>` in that case).
//   2. Copies the four files we care about (tool/{lemon.c,
//      mkkeywordhash.c, lempar.c}, src/parse.y) from the submodule /
//      source tree to vendor/upstream/<ref>/.
//   3. Picks the most recent previous version as the 3-way-merge base
//      and merges that version's patched + upstream + this version's
//      upstream into vendor/patched/<ref>/.  Conflicts leave <<<<<<<
//      markers and abort — resolve by hand, then re-run to commit.
//   4. Rewrites vendor/manifest.json with an entry for <ref>.  Old
//      versions are preserved forever (by design — this project treats
//      past releases as supported fixtures).
//   5. Invokes `make generated/<ref>/{parser,keywords}.prod.json` to
//      rebuild the JSON dumps and slim them.
//
// Usage:
//   bun run vendor <ref>                    # full flow; submodule from github
//   bun run vendor <ref> --no-submodule     # skip submodule; use --from instead
//   bun run vendor <ref> --from <path>      # copy pristine files from a local tree
//
// Notes on the submodule approach:
//   * We vendor the submodule at vendor/submodule/<ref>/, each with a
//     different URL/tag pinning.  SQLite's github mirror is fine for
//     this; swap for the Fossil mirror if preferred.
//   * We copy the four files we care about out to vendor/upstream/<ref>/
//     so the rest of the tooling doesn't have to know about submodule
//     working directories (which git can render empty after a clone
//     until submodule update runs).
//
// This script does NOT auto-commit and does NOT run `bun test` — too
// easy to hide a quiet regression.  Run the tests yourself once the
// script reports success.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { JSON_SCHEMA_VERSION } from './json-schemas.ts';
import { PACKAGE_NAME } from './package-info.ts';

// ---------------------------------------------------------------------------
// Paths.  Resolve everything relative to the package root so the script
// works regardless of where it's invoked from.
// ---------------------------------------------------------------------------

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const VENDOR = join(ROOT, 'vendor');
const MANIFEST = join(VENDOR, 'manifest.json');

/** Files we copy from upstream into vendor/upstream/<ver>/. */
const VENDORED_FILES = [
  'tool/lemon.c',
  'tool/mkkeywordhash.c',
  'tool/lempar.c',
  'src/parse.y',
] as const;

/** Subset of VENDORED_FILES that we patch — 3-way-merged into vendor/patched/<ver>/. */
const MERGE_TARGETS = [
  'tool/lemon.c',
  'tool/mkkeywordhash.c',
] as const;

// ---------------------------------------------------------------------------
// Manifest schema.
// ---------------------------------------------------------------------------

interface ManifestEntry {
  addedAt: string;
  upstreamCommit: string;
  upstreamUrl: string;
  jsonSchemaVersion: number;
  fileHashes: Record<string, string>;
}

interface Manifest {
  manifestVersion: 2;
  current: string;
  notes: string;
  versions: Record<string, ManifestEntry>;
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function sha256(path: string): string {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; allowNonZero?: boolean } = {},
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  const status = r.status ?? -1;
  if (!opts.allowNonZero && status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} exited ${status}:\n${r.stderr || r.stdout}`,
    );
  }
  return { status, stdout: r.stdout, stderr: r.stderr };
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function writeManifest(m: Manifest): void {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
}

/** `compareVersions('3.54.0', '3.55.1')` → -1 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Highest-semver existing version in the manifest, or null if none. */
function latestKnownVersion(m: Manifest, excluding?: string): string | null {
  const keys = Object.keys(m.versions).filter((k) => k !== excluding);
  keys.sort(compareVersions);
  return keys.length === 0 ? null : keys[keys.length - 1]!;
}

// ---------------------------------------------------------------------------
// Submodule setup.  We lean on `git submodule add` rather than rolling
// our own clone + pin machinery — it's what future maintainers will
// expect, and it keeps the per-version URL/ref intent in the git
// working tree (via .gitmodules) where it's inspectable.
// ---------------------------------------------------------------------------

const SQLITE_GITHUB_URL = 'https://github.com/sqlite/sqlite.git';

function ensureSubmodule(ref: string): string {
  const subPath = join(VENDOR, 'submodule', ref);
  if (existsSync(subPath) && existsSync(join(subPath, 'tool', 'lemon.c'))) {
    return subPath;
  }
  // Create or resurrect the submodule.  `git submodule add` will fail
  // if run twice on the same path — tolerate that and just checkout
  // the tag.
  console.log(`Adding submodule at vendor/submodule/${ref}…`);
  const add = run(
    'git',
    ['submodule', 'add', '--name', `sqlite-${ref}`, SQLITE_GITHUB_URL, `vendor/submodule/${ref}`],
    { allowNonZero: true },
  );
  if (add.status !== 0 && !/already exists/.test(add.stderr)) {
    throw new Error(`git submodule add failed:\n${add.stderr}`);
  }
  console.log(`Checking out tag version-${ref}…`);
  run('git', ['checkout', `version-${ref}`], { cwd: subPath });
  return subPath;
}

function copyUpstreamFiles(srcDir: string, ref: string): void {
  const dstDir = join(VENDOR, 'upstream', ref);
  for (const rel of VENDORED_FILES) {
    const src = join(srcDir, rel);
    if (!existsSync(src)) {
      throw new Error(`Missing upstream file: ${src}`);
    }
    const dst = join(dstDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
}

// ---------------------------------------------------------------------------
// 3-way merge.  `mine` = previous version's patched copy, `base` =
// previous version's upstream copy, `next` = this version's upstream
// copy.  Write the merged result to vendor/patched/<ref>/.  On
// conflict, leave <<<<<<< markers in the written file and return
// `hadConflict: true` — the caller aborts the manifest update.
// ---------------------------------------------------------------------------

interface MergeOutcome {
  hadConflict: boolean;
  conflictFiles: string[];
}

function threeWayMerge(newRef: string, baseRef: string): MergeOutcome {
  const out: MergeOutcome = { hadConflict: false, conflictFiles: [] };
  mkdirSync(join(VENDOR, 'patched', newRef, 'tool'), { recursive: true });

  for (const rel of MERGE_TARGETS) {
    const mine = join(VENDOR, 'patched', baseRef, rel);
    const base = join(VENDOR, 'upstream', baseRef, rel);
    const next = join(VENDOR, 'upstream', newRef,  rel);
    const dst  = join(VENDOR, 'patched',  newRef,  rel);

    const r = run('git', [
      'merge-file', '-p',
      '-L', `patched ${baseRef}`,
      '-L', `upstream ${baseRef}`,
      '-L', `upstream ${newRef}`,
      mine, base, next,
    ], { allowNonZero: true });

    writeFileSync(dst, r.stdout);
    if (r.status !== 0) {
      out.hadConflict = true;
      out.conflictFiles.push(`vendor/patched/${newRef}/${rel}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hash & manifest update.
// ---------------------------------------------------------------------------

function hashTreeForVersion(ref: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const rel of MERGE_TARGETS) {
    hashes[`patched/${ref}/${rel}`] = sha256(join(VENDOR, 'patched', ref, rel));
  }
  for (const rel of VENDORED_FILES) {
    hashes[`upstream/${ref}/${rel}`] = sha256(join(VENDOR, 'upstream', ref, rel));
  }
  return hashes;
}

/** Abort if any recorded file's sha256 doesn't match what's on disk. */
function verifyExistingHashes(m: Manifest): void {
  const mismatches: string[] = [];
  for (const entry of Object.values(m.versions)) {
    for (const [rel, recorded] of Object.entries(entry.fileHashes)) {
      const path = join(VENDOR, rel);
      if (!existsSync(path)) {
        mismatches.push(`${rel}: missing`);
        continue;
      }
      if (sha256(path) !== recorded) {
        mismatches.push(`${rel}: sha256 drifted`);
      }
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      'vendor/ has drifted from manifest.json:\n  ' + mismatches.join('\n  ') +
      '\nCommit or revert the local changes (then re-record hashes by running ' +
      'this script again on the same version).',
    );
  }
}

// ---------------------------------------------------------------------------
// CLI / main.
// ---------------------------------------------------------------------------

interface CliOptions {
  ref: string;
  useSubmodule: boolean;
  fromDir?: string;
  upstreamCommit?: string;
}

function parseCli(argv: string[]): CliOptions {
  const opts: Partial<CliOptions> & { useSubmodule?: boolean } = {
    useSubmodule: true,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--no-submodule') opts.useSubmodule = false;
    else if (a === '--from')    opts.fromDir = argv[++i];
    else if (a === '--commit')  opts.upstreamCommit = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log([
        'usage: bun run vendor <ref> [--no-submodule] [--from <dir>] [--commit <sha>]',
        '',
        '  <ref>              SQLite version tag, e.g. 3.55.0',
        '  --no-submodule     Do not add a git submodule; --from is required.',
        '  --from <dir>       Copy pristine files from an existing local checkout',
        '                     instead of the submodule.  Useful for testing and for',
        '                     building against an unreleased sqlite development tree.',
        '  --commit <sha>     Record this commit hash in the manifest.  Defaults to',
        '                     the HEAD of the submodule (or `unknown` with --from).',
      ].join('\n'));
      process.exit(0);
    }
    else positional.push(a);
  }
  if (positional.length !== 1) {
    throw new Error('expected exactly one positional argument: the version ref');
  }
  return {
    ref: positional[0]!,
    useSubmodule: opts.useSubmodule ?? true,
    fromDir: opts.fromDir,
    upstreamCommit: opts.upstreamCommit,
  };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));

  const manifest = readManifest();
  verifyExistingHashes(manifest);

  // 1. Locate the upstream source tree we're vendoring from.
  let upstreamSrc: string;
  if (cli.fromDir) {
    upstreamSrc = resolve(cli.fromDir);
    if (!existsSync(join(upstreamSrc, 'tool', 'lemon.c'))) {
      throw new Error(`--from path does not look like a sqlite checkout: ${upstreamSrc}`);
    }
  } else if (cli.useSubmodule) {
    upstreamSrc = ensureSubmodule(cli.ref);
  } else {
    throw new Error('--no-submodule requires --from <dir>');
  }

  // 2. Record the upstream commit we pinned.
  let upstreamCommit = cli.upstreamCommit;
  if (!upstreamCommit) {
    if (cli.fromDir) {
      upstreamCommit = 'unknown';
    } else {
      const sha = run('git', ['rev-parse', 'HEAD'], { cwd: upstreamSrc });
      upstreamCommit = sha.stdout.trim();
    }
  }

  // 3. Copy pristine upstream files.
  console.log(`Copying upstream files into vendor/upstream/${cli.ref}/…`);
  copyUpstreamFiles(upstreamSrc, cli.ref);

  // 4. Three-way merge against the previous version's patched + upstream.
  const prev = latestKnownVersion(manifest, cli.ref);
  if (!prev) {
    throw new Error(
      'No previous version in manifest to 3-way-merge against.  ' +
      'For the very first version, seed vendor/patched/<ref>/ by copying ' +
      'vendor/upstream/<ref>/ and applying your patches by hand, then ' +
      're-run this script.',
    );
  }
  console.log(`3-way-merging against previous version ${prev}…`);
  const merge = threeWayMerge(cli.ref, prev);
  if (merge.hadConflict) {
    console.error(
      '\nMerge had conflicts in:\n  ' + merge.conflictFiles.join('\n  ') +
      '\n\nResolve the <<<<<<< markers by hand, then re-run this script.',
    );
    process.exit(1);
  }

  // 5. Update the manifest.
  const newEntry: ManifestEntry = {
    addedAt: new Date().toISOString().slice(0, 10),
    upstreamCommit,
    upstreamUrl:
      cli.fromDir ? `file://${upstreamSrc}` : SQLITE_GITHUB_URL,
    jsonSchemaVersion: JSON_SCHEMA_VERSION,
    fileHashes: hashTreeForVersion(cli.ref),
  };
  writeManifest({
    ...manifest,
    current: cli.ref,
    versions: { ...manifest.versions, [cli.ref]: newEntry },
  });

  // 6. Regenerate the JSON dumps and the per-version TS wrapper.
  // Delegate to Make so it can incrementally rebuild and so humans
  // can reproduce just this step.  We also rebuild
  // `generated/current.ts` since the manifest now points at this ref.
  console.log(`Building generated/${cli.ref}/* via make…`);
  run('make', [
    `generated/${cli.ref}/parser.prod.json`,
    `generated/${cli.ref}/keywords.prod.json`,
    `generated/${cli.ref}/index.ts`,
    `generated/current.ts`,
  ], { cwd: ROOT });

  console.log(
    `\n${PACKAGE_NAME}: version ${cli.ref} is now current.  Next:\n` +
    `  * review vendor/patched/${cli.ref}/tool/*.c for correctness\n` +
    `  * run \`bun test\`\n` +
    `  * commit the new files + manifest if everything looks right`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
