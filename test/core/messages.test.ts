// The message formatter: {param}, plural, select, ICU quoting, and the never-throw guarantee.
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import {
  defaultMessages,
  formatMessage,
  formatTemplate,
  isValidTemplate,
} from '../../src/core/messages.ts'

describe('formatTemplate', () => {
  test('parameters, with unknown ones left visible', () => {
    expect(formatTemplate('{a} and {b}', { a: 'x', b: 2 })).toBe('x and 2')
    expect(formatTemplate('{a} and {missing}', { a: true })).toBe('true and {missing}')
  })

  test('plural: exact matches first, then the locale category, # is the formatted number', () => {
    const t = '{n, plural, =0 {no items} one {# item} other {# items}}'
    expect(formatTemplate(t, { n: 0 })).toBe('no items')
    expect(formatTemplate(t, { n: 1 })).toBe('1 item')
    expect(formatTemplate(t, { n: 1234 })).toBe('1,234 items')
    expect(formatTemplate(t, { n: 1234 }, 'de')).toBe('1.234 items')
    expect(formatTemplate(t, { n: '3' })).toBe('3 items') // numeric strings count
    expect(formatTemplate(t, { n: 'x' })).toBe('{n}') // non-numbers stay visible
    expect(formatTemplate(t, {})).toBe('{n}')
  })

  test('plural uses the locale rules (Polish "few") and falls back for invalid locales', () => {
    const t = '{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}'
    expect(formatTemplate(t, { n: 3 }, 'pl')).toBe('3 pliki')
    expect(formatTemplate(t, { n: 5 }, 'pl')).toBe('5 plików')
    expect(formatTemplate('{n, plural, one {#} other {# x}}', { n: 2 }, 'not a locale!')).toBe(
      '2 x',
    )
  })

  test('select, nested inside plural', () => {
    const t = '{s, select, draft {Draft} other {Other}}: {n, plural, one {# {s}} other {# {s}s}}'
    expect(formatTemplate(t, { s: 'draft', n: 2 })).toBe('Draft: 2 drafts')
    expect(formatTemplate(t, { s: 'void', n: 1 })).toBe('Other: 1 void')
    expect(formatTemplate('{s, select, a {A} other {O}}', {})).toBe('O')
  })

  test("ICU quoting: '' is an apostrophe, '{…}' is literal, # outside plural is text", () => {
    expect(formatTemplate("It''s {name}", { name: 'ok' })).toBe("It's ok")
    expect(formatTemplate("Use '{name}' literally", { name: 'x' })).toBe('Use {name} literally')
    expect(formatTemplate("'}'", {})).toBe('}')
    expect(formatTemplate("#1 {n, plural, other {'#' #}}", { n: 2 })).toBe('#1 # 2')
    expect(formatTemplate("don't", {})).toBe("don't")
  })

  test('malformed templates fall back to naive substitution instead of throwing', () => {
    expect(formatTemplate('{a', { a: 1 })).toBe('{a')
    expect(formatTemplate('a } b {c}', { c: 3 })).toBe('a } b 3')
    expect(formatTemplate('{n, plural, one {x}}', { n: 1 })).toBe('{n, plural, one {x}}') // no other
    expect(formatTemplate('{n, number}', { n: 1 })).toBe('{n, number}') // unsupported type
    expect(formatTemplate("'{unterminated", {})).toBe("'{unterminated")
    expect(formatTemplate('{n, plural, one x}', {})).toBe('{n, plural, one x}')
    expect(formatTemplate('{n, plural, one {x}', {})).toBe('{n, plural, one {x}')
    expect(formatTemplate('{n plural}', {})).toBe('{n plural}')
    expect(formatTemplate('{n, plural one {x}}', {})).toBe('{n, plural one {x}}')
    expect(formatTemplate('{n, plural, ! {x} other {y}}', {})).toBe('{n, plural, ! {x} other {y}}')
    expect(formatTemplate('{}', {})).toBe('{}')
  })

  test('never evaluates code and never reads prototype properties', () => {
    expect(formatTemplate('{constructor} {toString}', {})).toBe('{constructor} {toString}')
    const injection = ['$', '{process.exit()}'].join('')
    expect(formatTemplate(injection, {})).toBe(injection)
  })

  test('property: never throws on arbitrary templates and params', () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(
            '{',
            '}',
            ',',
            "'",
            '#',
            'a',
            'n',
            ' ',
            '=',
            '1',
            'plural',
            'select',
            'other',
            'one',
          ),
        }),
        fc.dictionary(
          fc.constantFrom('a', 'n', 'x'),
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.double()),
        ),
        (template, params) => {
          expect(typeof formatTemplate(template, params)).toBe('string')
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('formatMessage', () => {
  test('unknown codes fall back to `unknown`; unknown ui keys show the key', () => {
    expect(formatMessage(defaultMessages, 'nope', { attribute: 'X' })).toBe('X is invalid.')
    expect(formatMessage(defaultMessages, 'too_small', { attribute: 'X' })).toBe(
      'X must be at least {min}.',
    )
    expect(formatMessage(defaultMessages, 'ui.missing.key')).toBe('ui.missing.key')
    expect(formatMessage({}, 'nope', { attribute: 'Y' })).toBe('Y is invalid.')
  })

  test('plural catalog messages', () => {
    expect(formatMessage(defaultMessages, 'too_short', { attribute: 'Name', min: 1 })).toBe(
      'Name must be at least 1 character.',
    )
    expect(formatMessage(defaultMessages, 'too_long', { attribute: 'Name', max: 20 })).toBe(
      'Name must be at most 20 characters.',
    )
  })

  test('every built-in message is a valid template', () => {
    for (const [key, template] of Object.entries(defaultMessages)) {
      expect(isValidTemplate(template), key).toBe(true)
    }
    expect(isValidTemplate('{a')).toBe(false)
  })

  test('the template cache keeps working past its limit', () => {
    for (let i = 0; i < 1100; i++) expect(formatTemplate(`{a} ${i}`, { a: 'x' })).toBe(`x ${i}`)
  })
})
