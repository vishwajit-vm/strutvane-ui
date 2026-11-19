#!/usr/bin/env node
// @ts-check
// Managed by strutvane-tooling (canonical/.github/scripts/publish-if-new.mjs). Do not edit in
// package repos. See ADR-0016 ("version on main, CI publishes what's new") and ADR-0018 (staged
// publishing).
//
// STAGES this repo's package on npm (`npm stage publish`) only if its exact version is neither
// published nor already staged. A maintainer then approves the staged version on npmjs.com with
// 2FA, so a CI run alone can never make a version live. Safe to re-run (idempotent). Uses npm
// trusted publishing (OIDC) with provenance; no tokens.
//
// One package per repo, published from the repo root (v2 layout, hub docs/18 §3.2). The CLI repo
// was the only multi-package publisher and it was absorbed into the framework, so the pnpm
// workspace mode (and workspace-packages.mjs) is retired. A repo that declares workspaces fails
// closed here instead of silently publishing only its root.
//
// "409 = skip" (hub docs/18 §8, refining ADR-0018): if `npm stage publish` is refused because the
// version already exists (a re-run racing an earlier one, or a staged version `npm stage list`
// could not show), that is not a failure. But a 409 must never hide a tarball that CI did not
// build (hub security review F-21), so:
//   - if the version is PUBLISHED, its registry integrity must equal this build's `npm pack`
//     integrity, otherwise the run fails;
//   - if it is only STAGED (not visible yet), the run skips and prints this build's integrity, so
//     the maintainer can compare it with the staged tarball before approving.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

/**
 * Decide the npm dist-tag for a version. Exported for tests.
 * `1.2.3` → `latest`; `0.1.0-next.4` → `latest`; `0.1.0-canary.20261114` → `canary`.
 *
 * Why `next` goes to `latest`: the project lead decided (2026-11-19, consistency decision #131)
 * that before 1.0 every approved release is the default, so `npm install <pkg>` and the npm page
 * show the newest version. Other pre-release ids (`canary`, `rc`, …) keep their own tag, so an
 * experiment never becomes the default by accident.
 * @param {string} version
 * @returns {string}
 */
export function distTagFor(version) {
  const m = SEMVER.exec(version)
  if (!m) throw new Error(`not a valid semver version: "${version}"`)
  const pre = m[4]
  if (!pre) return 'latest'
  const id = pre.split('.')[0] ?? ''
  if (!/^[a-z][a-z0-9-]*$/.test(id) || id === 'latest') {
    throw new Error(`pre-release id "${id}" must be lowercase letters (e.g. next, canary)`)
  }
  return id === 'next' ? 'latest' : id
}

/**
 * Compare two versions by semver precedence, pre-releases included. Exported for tests.
 * `0.2.0-next.2` > `0.2.0-next.1` > `0.1.0`; `0.2.0` > `0.2.0-next.9`. Build metadata is ignored.
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
export function comparePrecedence(/** @type {string} */ a, /** @type {string} */ b) {
  const ma = SEMVER.exec(a)
  const mb = SEMVER.exec(b)
  if (!ma || !mb) throw new Error(`not a valid semver version: "${ma ? b : a}"`)
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i])
    if (d !== 0) return d
  }
  const pa = ma[4]
  const pb = mb[4]
  if (pa === undefined && pb === undefined) return 0
  if (pa === undefined) return 1
  if (pb === undefined) return -1
  const xa = pa.split('.')
  const xb = pb.split('.')
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const ia = xa[i]
    const ib = xb[i]
    if (ia === undefined) return -1
    if (ib === undefined) return 1
    const na = /^\d+$/.test(ia)
    const nb = /^\d+$/.test(ib)
    if (na && nb) {
      const d = Number(ia) - Number(ib)
      if (d !== 0) return d
    } else if (na !== nb) {
      return na ? -1 : 1
    } else if (ia !== ib) {
      return ia < ib ? -1 : 1
    }
  }
  return 0
}

/**
 * Compare two stable semver versions numerically. Exported for tests.
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
export function compareStable(/** @type {string} */ a, /** @type {string} */ b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Decide what to do. Pure: takes the registry state as input. Exported for tests.
 * @param {{ version: string, published: readonly string[], latest: string | undefined, staged?: readonly string[] }} input
 * @returns {{ action: 'skip', reason: string } | { action: 'stage', tag: string }}
 */
export function decide({ version, published, latest, staged = [] }) {
  const tag = distTagFor(version)
  if (published.includes(version)) return { action: 'skip', reason: `${version} is already on npm` }
  if (staged.includes(version)) {
    return { action: 'skip', reason: `${version} is already staged and waiting for approval` }
  }
  // Never move `latest` backwards (pre-releases included, since `next` releases now go there).
  // The `0.0.0-reserved.N` placeholders that hold unreleased names are always lower.
  if (tag === 'latest' && latest && comparePrecedence(version, latest) < 0) {
    throw new Error(`refusing to publish ${version} as latest: a higher latest (${latest}) exists`)
  }
  return { action: 'stage', tag }
}

/**
 * Collect the versions of `name` found in `npm stage list --json` output. The exact JSON shape is
 * not part of a documented contract yet, so this walks any nesting and keeps every object that has
 * a string `version` (and, when present, a matching `name`). Exported for tests.
 * @param {unknown} data
 * @param {string} name
 * @returns {string[]}
 */
export function stagedVersions(data, name) {
  /** @type {string[]} */
  const found = []
  const walk = (/** @type {unknown} */ node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node === null || typeof node !== 'object') return
    const rec = /** @type {Record<string, unknown>} */ (node)
    const recName = rec['name'] ?? rec['package']
    if (typeof rec['version'] === 'string' && (recName === undefined || recName === name)) {
      found.push(rec['version'])
    }
    for (const value of Object.values(rec)) if (value && typeof value === 'object') walk(value)
  }
  walk(data)
  return [...new Set(found)]
}

/**
 * True if npm's output says the registry refused the version because it already exists (HTTP
 * 409). npm prints `code E409` and `409 Conflict`; the registry's wording ("cannot publish over
 * the previously published versions") is matched too. The exact text for a STAGED duplicate is not
 * documented *(unverified)*, so all three forms are accepted. Exported for tests.
 * @param {string} output npm's stdout and stderr
 */
export function isPublishConflict(output) {
  return /\bE409\b|\b409 Conflict\b|cannot publish over|previously published/i.test(output)
}

/** @typedef {{ status: 'staged' | 'skipped', detail: string } | { status: 'failed', detail: string, code: number }} StageOutcome */

/**
 * What a 409 means, given this build's tarball integrity and the published one. Pure. Exported
 * for tests.
 * - Not published (only staged): skip, and name the integrity the maintainer must see on approval.
 * - Published with the same integrity: skip (an earlier run of this build already got through).
 * - Published with another integrity, or ours unknown: fail. A tarball CI did not build must
 *   never be passed over silently (security review F-21).
 * @param {{ version: string, localIntegrity: string | undefined, publishedIntegrity: string | undefined }} input
 * @returns {StageOutcome}
 */
export function resolveConflict({ version, localIntegrity, publishedIntegrity }) {
  const ours = localIntegrity ?? 'unknown (npm pack failed)'
  if (publishedIntegrity === undefined) {
    return {
      status: 'skipped',
      detail: `${version} is already staged (npm 409). Before approving it on npmjs.com, check its integrity is ${ours}`,
    }
  }
  if (localIntegrity === undefined) {
    return {
      status: 'failed',
      detail: `${version} is already published (npm 409) and this build's integrity could not be computed to verify it`,
      code: 1,
    }
  }
  if (publishedIntegrity !== localIntegrity) {
    return {
      status: 'failed',
      detail: `${version} is already published (npm 409) with integrity ${publishedIntegrity}, but this build is ${localIntegrity}. Investigate before releasing again`,
      code: 1,
    }
  }
  return { status: 'skipped', detail: `${version} is already published with this exact tarball` }
}

/** @typedef {{ name: string, version: string }} ReleaseTarget */

/**
 * The package to stage, or `undefined` when the root is private. Pure. Exported for tests.
 * Throws when the repo declares workspaces (npm `workspaces` or a pnpm `packages:` list): v2 has
 * one package per repo, and staging only the root of a multi-package repo would be a silent
 * partial release.
 * @param {Record<string, unknown>} root parsed root package.json
 * @param {{ hasWorkspaces: boolean }} layout
 * @returns {ReleaseTarget | undefined}
 */
export function releaseTarget(root, { hasWorkspaces }) {
  if (hasWorkspaces) {
    throw new Error(
      'this repo declares workspaces; Strutvane repos publish exactly one package from the root ' +
        '(hub docs/18 §3.2), and multi-package publishing was retired with workspace-packages.mjs',
    )
  }
  if (root['private']) return undefined
  const name = root['name']
  const version = root['version']
  if (typeof name !== 'string' || name === '') throw new Error('package.json needs a "name"')
  if (typeof version !== 'string' || version === '') {
    throw new Error('package.json needs a "version"')
  }
  return { name, version }
}

/**
 * True if the repo at `root` declares workspaces: a `workspaces` field in package.json, or a
 * `packages:` key in a leftover pnpm-workspace.yaml. Exported for tests.
 * @param {string} root
 * @param {Record<string, unknown>} manifest parsed root package.json
 */
export function declaresWorkspaces(root, manifest) {
  if (manifest['workspaces'] !== undefined) return true
  const pnpm = join(root, 'pnpm-workspace.yaml')
  return existsSync(pnpm) && /^packages\s*:/m.test(readFileSync(pnpm, 'utf8'))
}

/**
 * Read a JSON object file, with the file path in any error.
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function readJsonObject(file) {
  let value
  try {
    value = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${file}: must contain a JSON object`)
  }
  return value
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

/**
 * Run npm in `cwd` and capture its output.
 * @param {string[]} args
 * @param {string} cwd
 */
function runNpm(args, cwd) {
  return spawnSync(npm, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' })
}

/**
 * Versions of `name` already staged. If the list can't be read (e.g. the registry needs a login
 * for it), return `[]` with a warning: staging then either succeeds, hits a 409 (handled), or
 * fails loudly, and never makes anything live, because approval on npmjs.com is still required.
 */
function stagedState(/** @type {string} */ name, /** @type {string} */ cwd) {
  const r = runNpm(['stage', 'list', name, '--json'], cwd)
  if (r.status !== 0) {
    process.stderr.write(`warning: could not list staged versions: ${(r.stderr ?? '').trim()}\n`)
    return []
  }
  try {
    return stagedVersions(JSON.parse(r.stdout || '[]'), name)
  } catch {
    process.stderr.write('warning: could not parse `npm stage list --json` output\n')
    return []
  }
}

/** Read registry state for a package. A package that was never published yields empty state. */
function registryState(/** @type {string} */ name, /** @type {string} */ cwd) {
  const r = runNpm(['view', name, 'versions', 'dist-tags', '--json'], cwd)
  if (r.status !== 0) {
    if (/E404|404 Not Found/.test(r.stderr ?? '')) return { published: [], latest: undefined }
    throw new Error(`npm view failed: ${(r.stderr ?? '').trim()}`)
  }
  const data = JSON.parse(r.stdout || '{}')
  const versions = Array.isArray(data.versions)
    ? data.versions
    : data.versions
      ? [data.versions]
      : []
  return { published: versions, latest: data['dist-tags']?.latest }
}

/**
 * Parse a JSON string value printed by `npm view … --json` / `npm pack --json`, tolerating
 * empty output. Returns the first string found.
 * @param {string} text
 * @param {(data: unknown) => unknown} pick
 * @returns {string | undefined}
 */
function jsonString(text, pick) {
  try {
    const value = pick(JSON.parse(text))
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/** Integrity (sha512) of the tarball this build would publish. Scripts never run here. */
function localIntegrity(/** @type {string} */ cwd) {
  const r = runNpm(['pack', '--dry-run', '--json', '--ignore-scripts'], cwd)
  if (r.status !== 0) return undefined
  return jsonString(r.stdout ?? '', (d) =>
    Array.isArray(d) && d[0] && typeof d[0] === 'object' ? d[0].integrity : undefined,
  )
}

/** Integrity of the published `name@version`, or undefined if that version is not published. */
function publishedIntegrity(/** @type {ReleaseTarget} */ { name, version }, cwd = '.') {
  const r = runNpm(['view', `${name}@${version}`, 'dist.integrity', '--json'], cwd)
  if (r.status !== 0) return undefined
  return jsonString(r.stdout ?? '', (d) => d)
}

/**
 * Stage the package unless it is already published or staged; a 409 goes through
 * resolveConflict.
 * @param {ReleaseTarget} target
 * @param {string} cwd
 * @returns {StageOutcome}
 */
function stageOne(target, cwd) {
  const { name, version } = target
  const decision = decide({
    version,
    ...registryState(name, cwd),
    staged: stagedState(name, cwd),
  })
  if (decision.action === 'skip') return { status: 'skipped', detail: decision.reason }
  process.stdout.write(`staging ${name}@${version} with tag "${decision.tag}"\n`)
  const r = runNpm(
    ['stage', 'publish', '--access', 'public', '--provenance', '--tag', decision.tag],
    cwd,
  )
  process.stdout.write(r.stdout ?? '')
  process.stderr.write(r.stderr ?? '')
  if (r.status === 0) {
    return { status: 'staged', detail: 'staged. Approve it on npmjs.com to make it live.' }
  }
  if (isPublishConflict(`${r.stdout ?? ''}\n${r.stderr ?? ''}`)) {
    return resolveConflict({
      version,
      localIntegrity: localIntegrity(cwd),
      publishedIntegrity: publishedIntegrity(target, cwd),
    })
  }
  const code = r.status ?? 1
  return { status: 'failed', detail: `npm stage publish exited with code ${code}`, code }
}

function main() {
  const repoRoot = process.cwd()
  const root = readJsonObject(join(repoRoot, 'package.json'))
  const target = releaseTarget(root, { hasWorkspaces: declaresWorkspaces(repoRoot, root) })
  if (!target) {
    process.stdout.write(`${String(root['name'])} is private, nothing to publish.\n`)
    return
  }
  const outcome = stageOne(target, repoRoot)
  const label = outcome.status === 'skipped' ? 'skip' : outcome.status
  process.stdout.write(`${label}: ${target.name}@${target.version}: ${outcome.detail}\n`)
  if (outcome.status === 'failed') process.exitCode = outcome.code
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `publish failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
