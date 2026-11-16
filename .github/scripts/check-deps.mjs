#!/usr/bin/env node
// @ts-check
// Managed by strutvane-tooling (canonical/.github/scripts/check-deps.mjs). Do not edit in package repos.
//
// Fails if the repo commits a dependency that only works on one developer's machine, or a
// lockfile entry that does not come from the npm registry. Runs in CI before `npm ci`, so it is
// dependency-free.
//
// 1. package.json: link:, file:, workspace:, portal: or a relative/absolute path in any dependency
//    field or in npm `overrides`. Local links are for the dev-only umbrella workspace (hub
//    scripts/setup-workspace.mjs), which links siblings without editing any package.json; they
//    must never be committed (ADR-0016).
// 2. package-lock.json (hub security review F-21, lockfile injection): every installed entry must
//    be `resolved` from https://registry.npmjs.org/, and none may be a `link`. A PR that points a
//    `resolved` URL at another host, or links a local folder, fails here. Git dependencies are
//    also refused by `.npmrc` `allow-git=none`.
// 3. pnpm-workspace.yaml (repos still moving off pnpm): local `overrides` lines are flagged too.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCAL_SPEC = /^(link:|file:|workspace:|portal:|\.{1,2}\/|\/|[A-Za-z]:[\\/])/
const REGISTRY = 'https://registry.npmjs.org/'
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/**
 * Walk npm `overrides`, which nest (`{ "a": { "b": "1.0.0", ".": "2.0.0" } }`), and report every
 * local spec with its path.
 * @param {unknown} node
 * @param {string} path
 * @param {string[]} problems
 */
function checkOverrides(node, path, problems) {
  if (typeof node === 'string') {
    if (LOCAL_SPEC.test(node)) problems.push(`${path} = "${node}"`)
    return
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node))
      checkOverrides(value, `${path}.${key}`, problems)
  }
}

/**
 * Find local-only dependency specs. Exported for tests.
 * @param {Record<string, unknown>} pkg parsed package.json
 * @param {string} workspaceYaml contents of pnpm-workspace.yaml ('' if absent)
 * @returns {string[]} human-readable problems
 */
export function findLocalDeps(pkg, workspaceYaml) {
  /** @type {string[]} */
  const problems = []
  for (const field of DEP_FIELDS) {
    const deps = pkg[field]
    if (deps && typeof deps === 'object') {
      for (const [name, spec] of Object.entries(deps)) {
        if (typeof spec === 'string' && LOCAL_SPEC.test(spec))
          problems.push(`${field}.${name} = "${spec}"`)
      }
    }
  }
  checkOverrides(pkg['overrides'], 'overrides', problems)
  // pnpm overrides in pnpm-workspace.yaml: lines like `  '@strutvane/contracts': link:../contracts`
  for (const line of workspaceYaml.split(/\r?\n/)) {
    const m = /^\s+['"]?([^'":]+)['"]?\s*:\s*['"]?([^'"\s#]+)/.exec(line)
    if (m?.[2] && LOCAL_SPEC.test(m[2])) problems.push(`pnpm-workspace.yaml: ${m[1]} = "${m[2]}"`)
  }
  return problems
}

/**
 * Find package-lock.json entries that do not come from the npm registry. Exported for tests.
 * The root entry (`""`) is the repo itself. Bundled entries (`inBundle`) ship inside their
 * parent's tarball and have no `resolved`. Any other entry must have a registry `resolved` URL.
 * @param {unknown} lock parsed package-lock.json
 * @returns {string[]}
 */
export function findLockfileProblems(lock) {
  if (lock === null || typeof lock !== 'object' || Array.isArray(lock)) {
    return ['package-lock.json: must contain a JSON object']
  }
  const packages = /** @type {Record<string, unknown>} */ (lock)['packages']
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    return ['package-lock.json: no "packages" map (lockfileVersion 3 is required; run npm install)']
  }
  /** @type {string[]} */
  const problems = []
  for (const [path, value] of Object.entries(packages)) {
    if (path === '') continue
    const entry = /** @type {Record<string, unknown>} */ (value ?? {})
    if (entry['link'] === true) {
      problems.push(`package-lock.json: ${path} is a local link`)
      continue
    }
    if (entry['inBundle'] === true) continue
    const resolved = entry['resolved']
    if (typeof resolved !== 'string' || !resolved.startsWith(REGISTRY)) {
      problems.push(
        `package-lock.json: ${path} is resolved from ${typeof resolved === 'string' ? `"${resolved}"` : 'nowhere'}, not ${REGISTRY}`,
      )
    }
  }
  return problems
}

/**
 * Read a JSON file, with the file path in any error (fail closed: unreadable must not pass).
 * @param {string} file
 * @returns {unknown}
 */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Check the repo at `root`: package.json, package-lock.json (if present) and pnpm-workspace.yaml
 * (if present). Exported for tests.
 * @param {string} root
 * @returns {string[]}
 */
export function findRepoLocalDeps(root) {
  const pkg = readJson(join(root, 'package.json'))
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error(`${join(root, 'package.json')}: must contain a JSON object`)
  }
  const wsFile = join(root, 'pnpm-workspace.yaml')
  const ws = existsSync(wsFile) ? readFileSync(wsFile, 'utf8') : ''
  const problems = findLocalDeps(/** @type {Record<string, unknown>} */ (pkg), ws)
  const lockFile = join(root, 'package-lock.json')
  if (existsSync(lockFile)) problems.push(...findLockfileProblems(readJson(lockFile)))
  return problems
}

function main() {
  const problems = findRepoLocalDeps(process.cwd())
  if (problems.length > 0) {
    process.stderr.write(
      `Local-only or non-registry dependencies must not be committed (ADR-0016, F-21):\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Depend on a published version instead (e.g. "@strutvane/framework": "0.1.0-next.0"), and reinstall from the npm registry.\n',
    )
    process.exitCode = 1
    return
  }
  const lock = existsSync(join(process.cwd(), 'package-lock.json'))
    ? 'package-lock.json resolves only from the npm registry'
    : 'no package-lock.json to check'
  process.stdout.write(`No local-only dependencies; ${lock}.\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `check-deps failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
