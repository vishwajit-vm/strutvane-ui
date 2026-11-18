/**
 * The UI speaks the framework 0.2 error model (CONSISTENCY #68, #123, #69; hub RFC-0003):
 *
 * - no string literal in `src/` is an uppercase error code (`'NOT_FOUND'`, `'INTERNAL_ERROR'`), so a
 *   comparison, a synthetic problem or a catalogue key can never fall back to the 0.1 names;
 * - every code the UI produces itself is one the framework knows, in the framework's spelling;
 * - every issue the UI produces or parses carries the dotted `field` member, agreeing with `path`.
 *
 * The scan reads string literals through the TypeScript parser, so comments that quote the old names
 * (for example in an upgrade note) are not flagged.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PROBLEM_CODES } from '@strutvane/framework/contracts'
import { LEGACY_ERROR_CODES } from '@strutvane/framework/core'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { defaultMessages } from '../src/core/messages.ts'
import {
  INTERNAL_ERROR_CODE,
  NETWORK_ERROR_CODE,
  networkProblem,
  pathToField,
  sanitizeProblem,
  syntheticProblem,
} from '../src/core/problems.ts'
import { validateArrayItems, validateField } from '../src/core/validation.ts'
import { field, invoiceResource } from './fixtures/manifest.ts'

const SRC = join(import.meta.dirname, '..', 'src')

/** `SCREAMING_SNAKE_CASE` with at least one underscore: the shape of every 0.1 code. */
const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/

/** Every old name, including the single-word ones the pattern cannot see (`FORBIDDEN`). */
const LEGACY_NAMES: ReadonlySet<string> = new Set(Object.keys(LEGACY_ERROR_CODES))

/** A catalogue key for a code must use the lowercase code. */
const PROBLEM_KEY = /^ui\.problem\.code\./
const LOWERCASE_PROBLEM_KEY = /^ui\.problem\.code\.[a-z][a-z0-9_]*$/

interface Finding {
  readonly file: string
  readonly line: number
  readonly text: string
}

/** Every string literal (and template text) in a source file that looks like an uppercase code. */
function uppercaseCodeLiterals(fileName: string, source: string): Finding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const findings: Finding[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const text = node.text
      // Only a whole string is a complete catalogue key; `ui.problem.code.${code}` is a prefix.
      const whole = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      const bad =
        SCREAMING_SNAKE.test(text) ||
        LEGACY_NAMES.has(text) ||
        (whole && PROBLEM_KEY.test(text) && !LOWERCASE_PROBLEM_KEY.test(text))
      if (bad) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        findings.push({ file: fileName, line: line + 1, text })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('error codes are lowercase snake_case (#68, #123)', () => {
  test('the scan finds uppercase codes in code and ignores them in comments', () => {
    const sample = [
      "// 'NOT_FOUND' was the 0.1 name",
      '/** Was `INTERNAL_ERROR`. */',
      "const a = problem.code === 'NOT_FOUND'",
      "const b = { code: 'FORBIDDEN' }",
      'const c = `RATE_LIMITED`',
      "const d = 'ui.problem.code.CONFLICT'",
      "const e = 'not_found' + 'INPUT' + 'GET'",
    ].join('\n')
    expect(uppercaseCodeLiterals('sample.ts', sample).map((f) => [f.line, f.text])).toEqual([
      [3, 'NOT_FOUND'],
      [4, 'FORBIDDEN'],
      [5, 'RATE_LIMITED'],
      [6, 'ui.problem.code.CONFLICT'],
    ])
  })

  test('no source file in src/ contains an uppercase code literal', () => {
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(20)
    const findings = files.flatMap((file) =>
      uppercaseCodeLiterals(relative(SRC, file), readFileSync(file, 'utf8')),
    )
    expect(findings.map((f) => `${f.file}:${f.line} '${f.text}'`)).toEqual([])
  })

  test('every catalogue key for a code is lowercase', () => {
    const keys = Object.keys(defaultMessages).filter((k) => PROBLEM_KEY.test(k))
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys) expect(key).toMatch(LOWERCASE_PROBLEM_KEY)
  })

  test('every code the UI makes up is a framework 0.2 code (or the UI-only network code)', () => {
    // 419 is the framework's CSRF refusal (#30); it is not a "well-known" ProblemCode in contracts.
    const known: ReadonlySet<string> = new Set([...PROBLEM_CODES, 'csrf_token_mismatch'])
    for (let status = 400; status <= 599; status++) {
      expect(known, `status ${status}`).toContain(syntheticProblem(status).code)
    }
    expect(known).toContain(INTERNAL_ERROR_CODE)
    expect(networkProblem().code).toBe(NETWORK_ERROR_CODE)
    expect(NETWORK_ERROR_CODE).toBe('network_error')
    // The network code is the UI's own and must never collide with a server code.
    expect(known).not.toContain(NETWORK_ERROR_CODE)
  })

  test('the old names all map to the lowercase names the UI uses', () => {
    for (const code of PROBLEM_CODES) expect(LEGACY_ERROR_CODES[code.toUpperCase()]).toBe(code)
  })
})

describe('issues carry the field member (#69)', () => {
  const lines = invoiceResource.fields.find((f) => f.name === 'lines')

  test('pathToField matches the framework spelling', () => {
    expect(pathToField(['lines', 2, 'amount'])).toBe('lines.2.amount')
    expect(pathToField([])).toBe('')
  })

  test('client-side issues carry field = the dotted path', () => {
    const title = field({ name: 'title', type: 'string', label: 'Title', required: true })
    const scalar = validateField(title, '', defaultMessages)
    expect(scalar).toEqual([expect.objectContaining({ path: ['title'], field: 'title' })])
    if (lines === undefined) throw new Error('the fixture has no lines field')
    const items = validateArrayItems(lines, [{ description: 'ok', amount: -5 }], defaultMessages)
    expect(items.map((i) => [i.path, i.field])).toEqual([
      [['lines', 0, 'amount'], 'lines.0.amount'],
    ])
  })

  test('parsed issues always carry field, rebuilt from the path that wins', () => {
    const p = sanitizeProblem({
      type: 'about:blank',
      title: 'Invalid',
      status: 422,
      code: 'validation_failed',
      issues: [
        // A 0.2 server: both members, agreeing.
        { path: ['lines', 1, 'amount'], field: 'lines.1.amount', code: 'too_small', message: 'A' },
        // Members that disagree: path is the source of truth, field follows it.
        { path: ['title'], field: 'other', code: 'required', message: 'B' },
        // Only field (a non-Strutvane backend): the path is derived from it.
        { field: 'items.0.title', code: 'required', message: 'C' },
        // Only path (an older or third-party backend): field is derived from it.
        { path: ['a.b'], code: 'x', message: 'D' },
      ],
    })
    expect(p?.issues?.map((i) => [i.path, i.field, i.message])).toEqual([
      [['lines', 1, 'amount'], 'lines.1.amount', 'A'],
      [['title'], 'title', 'B'],
      [['items', 0, 'title'], 'items.0.title', 'C'],
      [['a.b'], 'a.b', 'D'],
    ])
  })
})
