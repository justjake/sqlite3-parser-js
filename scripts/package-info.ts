// scripts/package-info.ts — thin wrapper that reads package.json once
// so the other scripts can access project metadata without each of them
// re-inventing the "find package.json relative to this file" dance.
//
// Use:
//   import { PACKAGE_NAME, PACKAGE_VERSION } from './package-info.ts';
//
// Keep this file import-only: no side effects, no top-level logging —
// scripts/*.ts import it transitively via scripts/vendor.ts's make
// dispatch, so noisy output here would leak into vendor flow.

import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

export const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
export const PACKAGE_JSON_PATH = resolve(REPO_ROOT, "package.json")

const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
  name: string
  version: string
}

/** The package name as declared in package.json.  Used for import-path
 *  strings baked into generated code (`generated/<ver>/index.ts`, the
 *  JSON Schema `$id`, etc.) so renaming the package only requires
 *  editing one place. */
export const PACKAGE_NAME: string = pkg.name

/** The package's declared version.  Not widely used today, but handy
 *  for future "stamp the build with metadata" needs. */
export const PACKAGE_VERSION: string = pkg.version

export function rootPath(...subpaths: string[]): string {
  return resolve(REPO_ROOT, ...subpaths)
}

export function rootRelativePath(...subpaths: string[]): string {
  const path = rootPath(...subpaths)
  return relative(REPO_ROOT, path)
}
