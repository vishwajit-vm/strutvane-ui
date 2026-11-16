#!/usr/bin/env node
// @ts-check
// Managed by strutvane-tooling (canonical/.github/scripts/check-code-rules.mjs). Do not edit in
// package repos.
//
// Production-readiness gate R1 (hub docs/19), the parts Biome and tsc don't cover:
//   1. No `console.` in package code (src/). Packages log through the framework Logger, which
//      redacts secrets and respects LOG_LEVEL (ADR-0022); a stray console.log bypasses both.
//      A file that must write to the console (a CLI entry point, say) is listed by exact path in
//      package.json `strutvane.allowConsole`. Entries must exist and must still use the console,
//      so the allowlist can't rot.
//   2. No TODO or FIXME without an issue reference, `(#123)` or an issues URL on the same line, in
//      src/ and test/. Untracked TODOs are how "temporary" code reaches a release.
//
// Line based on purpose, so it stays dependency-free and predictable: a line whose code starts
// with `//`, `/*` or `*` is a comment and is skipped by the console rule (TSDoc examples may show
// console calls). A console call followed by a trailing comment is still caught.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/
// A console method (called or passed around) or a computed access. Matching method names instead
// of any `console.` keeps a module path such as './transports/console.ts' and prose such as
// "never `console.*`" from failing the check.
const CONSOLE =
  /(?<![\w$/-])console\s*(?:\?\.|\.)\s*(?:log|info|warn|error|debug|trace|table|dir|dirxml|time|timeEnd|timeLog|assert|count|countReset|group|groupCollapsed|groupEnd|clear|profile|profileEnd)\b|(?<![\w$/-])console\s*(?:\?\.)?\s*\[/
const TODO = /\b(?:TODO|FIXME)\b/
const ISSUE_REF = /\(#\d+\)|https?:\/\/\S+\/issues\/\d+/
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/

/**
 * 1-based line numbers that use the console outside comment lines. Exported for tests.
 * @param {string} text
 * @returns {number[]}
 */
export function findConsoleUses(text) {
  /** @type {number[]} */
  const lines = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (!COMMENT_LINE.test(line) && CONSOLE.test(line)) lines.push(i + 1)
  })
  return lines
}

/**
 * 1-based line numbers with a TODO or FIXME that names no issue. Exported for tests.
 * @param {string} text
 * @returns {number[]}
 */
export function findUntrackedTodos(text) {
  /** @type {number[]} */
  const lines = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (TODO.test(line) && !ISSUE_REF.test(line)) lines.push(i + 1)
  })
  return lines
}

/**
 * Read `strutvane.allowConsole` from package.json: exact repo-relative paths under src/, written
 * with `/`. Anything else is an error (fail closed: a glob or a typo must not widen the list).
 * Exported for tests.
 * @param {Record<string, unknown>} pkg
 * @returns {string[]}
 */
export function parseAllowConsole(pkg) {
  const block = pkg['strutvane']
  if (block === undefined) return []
  if (block === null || typeof block !== 'object' || Array.isArray(block)) {
    throw new Error('package.json "strutvane" must be an object')
  }
  const list = /** @type {Record<string, unknown>} */ (block)['allowConsole']
  if (list === undefined) return []
  if (!Array.isArray(list))
    throw new Error('package.json "strutvane.allowConsole" must be an array')
  return list.map((entry, i) => {
    if (
      typeof entry !== 'string' ||
      !entry.startsWith('src/') ||
      entry.includes('\\') ||
      entry.includes('*') ||
      entry.split('/').some((s) => s === '' || s === '.' || s === '..')
    ) {
      throw new Error(
        `package.json "strutvane.allowConsole"[${i}] must be an exact path under src/ (e.g. "src/console/bin.ts")`,
      )
    }
    return entry
  })
}

/**
 * Source files under `dir` (repo-relative, `/`-separated, sorted). Skips node_modules and hidden
 * folders.
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(root, dir) {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && SOURCE_EXT.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split('\\').join('/'))
    .filter((p) => !p.split('/').some((s) => s === 'node_modules' || s.startsWith('.')))
    .sort()
}

/**
 * Check the repo at `root`. Returns human-readable problems (empty when clean). Exported for tests.
 * @param {string} root
 * @returns {string[]}
 */
export function checkRepo(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const allowed = new Set(parseAllowConsole(pkg))
  /** @type {string[]} */
  const problems = []
  const src = sourceFiles(root, 'src')
  for (const file of src) {
    const uses = findConsoleUses(readFileSync(join(root, file), 'utf8'))
    if (uses.length === 0) {
      if (allowed.has(file)) {
        problems.push(`${file}: listed in strutvane.allowConsole but no longer uses the console`)
      }
      continue
    }
    if (!allowed.has(file)) {
      for (const line of uses) {
        problems.push(`${file}:${line}: console call in package code; use the framework Logger`)
      }
    }
  }
  for (const entry of allowed) {
    if (!src.includes(entry))
      problems.push(`strutvane.allowConsole lists ${entry}, which does not exist`)
  }
  for (const file of [...src, ...sourceFiles(root, 'test')]) {
    for (const line of findUntrackedTodos(readFileSync(join(root, file), 'utf8'))) {
      problems.push(`${file}:${line}: TODO/FIXME without an issue reference "(#123)" or issue URL`)
    }
  }
  return problems
}

function main() {
  const problems = checkRepo(process.cwd())
  if (problems.length > 0) {
    process.stderr.write(
      `Code rules (production readiness R1, hub docs/19):\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
    )
    process.exitCode = 1
    return
  }
  process.stdout.write('Code rules: no console calls in src/, every TODO/FIXME names an issue.\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(
      `check-code-rules failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}
