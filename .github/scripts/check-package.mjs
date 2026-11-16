#!/usr/bin/env node
// @ts-check
// Managed by strutvane-tooling (canonical/.github/scripts/check-package.mjs). Do not edit in
// package repos.
//
// Production-readiness gate R5 (hub docs/19), the content checks. Run after the build. It reads
// `npm pack --dry-run --json` (exactly what would be published) and fails on:
//   - tests, fixtures, coverage or test-type files in the tarball (they bloat installs and can
//     leak internal data);
//   - env files, keys, .npmrc (secrets);
//   - source maps whose `sourceRoot` or `sources` are absolute local paths (they leak the build
//     machine's paths and break debuggers for users);
//   - a missing README or LICENSE in the tarball, or a missing CHANGELOG.md in the repo;
//   - `engines.node` below `>=24.3` (docs/19 R5).
// publint and @arethetypeswrong/cli then run on the packed tarball in the CI job.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Paths that must never be published, with the reason. */
const FORBIDDEN = /** @type {const} */ ([
  [
    /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__|coverage)\//,
    'test, fixture or coverage folder',
  ],
  [/\.(?:test|spec|test-d)\.[cm]?[jt]sx?$/, 'test file'],
  [/(?:^|\/)\.env(?:\.(?!example$)[^/]*)?$/, 'env file'],
  [/(?:^|\/)\.npmrc$/, '.npmrc'],
  [/\.(?:pem|key|p12|pfx)$/, 'key or certificate'],
])

/** An absolute local path: Windows drive, UNC, POSIX root or file: URL. */
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\|\/|file:)/

/**
 * Problems with the list of files `npm pack` would publish. Pure. Exported for tests.
 * @param {readonly string[]} paths tarball paths, `/`-separated, relative to the package root
 * @returns {string[]}
 */
export function checkPackFiles(paths) {
  /** @type {string[]} */
  const problems = []
  for (const path of paths) {
    // One problem per path: the first rule that matches explains it.
    const hit = FORBIDDEN.find(([pattern]) => pattern.test(path))
    if (hit) problems.push(`${path}: ${hit[1]} must not be published`)
  }
  if (!paths.some((p) => /^readme(?:\.|$)/i.test(p)))
    problems.push('README is missing from the package')
  if (!paths.some((p) => /^licen[cs]e(?:\.|$)/i.test(p)))
    problems.push('LICENSE is missing from the package')
  return problems
}

/**
 * Problems with one source map's text: unparsable, or absolute local paths. Exported for tests.
 * @param {string} path
 * @param {string} text
 * @returns {string[]}
 */
export function checkSourceMap(path, text) {
  let map
  try {
    map = JSON.parse(text)
  } catch {
    return [`${path}: not valid JSON`]
  }
  const roots = [map?.sourceRoot, ...(Array.isArray(map?.sources) ? map.sources : [])]
  const local = roots.filter((s) => typeof s === 'string' && ABSOLUTE.test(s))
  return local.length > 0 ? [`${path}: source map has local absolute paths (${local[0]})`] : []
}

/**
 * `engines.node` must exist and start at Node 24.3 or later (`>=24.3`, `>=24.3.0`, `>=26`).
 * Exported for tests.
 * @param {Record<string, unknown>} pkg
 * @returns {string[]}
 */
export function checkEngines(pkg) {
  const engines = pkg['engines']
  const node =
    engines && typeof engines === 'object'
      ? /** @type {Record<string, unknown>} */ (engines)['node']
      : undefined
  const m = typeof node === 'string' ? /^>=\s*(\d+)(?:\.(\d+))?(?:\.\d+)?$/.exec(node.trim()) : null
  const major = Number(m?.[1] ?? 0)
  const minor = Number(m?.[2] ?? 0)
  if (!m || major < 24 || (major === 24 && minor < 3)) {
    return [`package.json engines.node is ${JSON.stringify(node)}; it must be ">=24.3" or higher`]
  }
  return []
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function main() {
  const root = process.cwd()
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (pkg.private) {
    process.stdout.write(`${String(pkg.name)} is private, nothing is published; skipped.\n`)
    return
  }
  // A fixed command string (no user input), so running it through the shell is safe; Windows
  // needs the shell to start npm.cmd at all.
  const r = spawnSync(`${npm} pack --dry-run --json --ignore-scripts`, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  })
  if (r.status !== 0) throw new Error(`npm pack --dry-run failed: ${(r.stderr ?? '').trim()}`)
  const packed = JSON.parse(r.stdout)
  const files = Array.isArray(packed) && Array.isArray(packed[0]?.files) ? packed[0].files : null
  if (!files) throw new Error('npm pack --dry-run --json returned no file list')
  /** @type {string[]} */
  const paths = files.map((/** @type {{ path: string }} */ f) => f.path.split('\\').join('/'))
  const problems = [...checkPackFiles(paths), ...checkEngines(pkg)]
  for (const path of paths.filter((p) => p.endsWith('.map'))) {
    problems.push(...checkSourceMap(path, readFileSync(join(root, path), 'utf8')))
  }
  if (!existsSync(join(root, 'CHANGELOG.md')))
    problems.push('CHANGELOG.md is missing from the repo')
  if (problems.length > 0) {
    process.stderr.write(
      `Package contents (production readiness R5, hub docs/19):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
    )
    process.exitCode = 1
    return
  }
  process.stdout.write(`Package contents OK: ${paths.length} file(s).\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `check-package failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
