// @vitest-environment jsdom
// The conformance kit's own tests: every check must CATCH a design that breaks its rule (a kit that
// only ever passes proves nothing), and pass the plain design.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { afterAll, describe, expect, test } from 'vitest'
import type { Design } from '../../src/design/define-design.ts'
import { plain } from '../../src/design/plain/index.ts'
import type { FieldProps, ShellProps } from '../../src/design/slots.ts'
import { designStylesheet } from '../../src/design/stylesheet.ts'
import type { ThemeTokens } from '../../src/design/tokens.ts'
import {
  axeViolations,
  checkContrast,
  checkInjectedOverrides,
  checkOverflowDom,
  checkOverflowStylesheet,
  checkOverrides,
  checkSlots,
  checkSourceColours,
  createReferenceApi,
  findHardCodedColours,
  mount,
  OVERRIDE_SAMPLES,
  renderReferenceScreen,
} from '../../src/testing/index.ts'

/** The plain design with some parts replaced, bypassing defineDesign (as a JS design could). */
const broken = (over: Record<string, unknown>): Design => ({ ...plain, ...over }) as Design
const withLight = (color: Partial<ThemeTokens['color']>): Design =>
  broken({
    tokens: {
      light: { ...plain.tokens.light, color: { ...plain.tokens.light.color, ...color } },
      dark: plain.tokens.dark,
    },
  })

describe('the plain design passes every check', () => {
  test('pure checks', () => {
    expect(checkSlots(plain)).toEqual([])
    expect(checkContrast(plain)).toEqual([])
    expect(checkOverrides(plain)).toEqual([])
    expect(checkOverflowStylesheet(plain)).toEqual([])
    expect(checkSourceColours(plain)).toEqual([])
    expect(
      checkInjectedOverrides(plain, designStylesheet(plain, { overrides: OVERRIDE_SAMPLES })),
    ).toEqual([])
  })
})

describe('slots', () => {
  test('a missing slot is caught', () => {
    const { Table: _gone, ...skins } = plain.skins
    expect(checkSlots(broken({ skins }))).toContain('skins.Table is missing (a component)')
  })
})

describe('contrast', () => {
  test('a pair below 4.5:1 is caught, with its ratio and theme', () => {
    const problems = checkContrast(withLight({ fgMuted: '#b0b0b0' }))
    expect(
      problems.some((p) =>
        /^light: --sv-fg-muted on --sv-surface is \d\.\d\d:1( at --brand-hue \d+)?; WCAG AA needs 4\.5:1$/.test(
          p,
        ),
      ),
    ).toBe(true)
  })

  test('an accent that fails at SOME brand hue is caught, naming the hue', () => {
    const problems = checkContrast(
      withLight({
        accent: 'oklch(0.66 0.16 var(--brand-hue))',
        accentHover: 'oklch(0.6 0.16 var(--brand-hue))',
      }),
    )
    expect(
      problems.some((p) => /--sv-accent-fg on --sv-accent .* at --brand-hue \d+;/.test(p)),
    ).toBe(true)
  })

  test('a non-text pair below 3:1 (control border) is caught', () => {
    expect(checkContrast(withLight({ input: '#e0e0e0' }))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^light: --sv-input on --sv-surface is/)]),
    )
  })

  test('translucent and unreadable colours are reported, not guessed', () => {
    expect(checkContrast(withLight({ surface: 'rgb(255 255 255 / 0.5)' }))).toEqual(
      expect.arrayContaining([expect.stringMatching(/must be opaque to be checked$/)]),
    )
    expect(
      checkContrast(withLight({ fg: 'oklch(0.2 0 var(--missing))' as `oklch(${string})` })),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/can't be read as colours$/)]))
  })

  test('the lead chart series must stand out from the surface (3:1)', () => {
    const faint = broken({
      chartPalette: { light: ['#f4f4f4', '#000', '#000', '#000'], dark: plain.chartPalette.dark },
    })
    expect(checkContrast(faint)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^light: --sv-chart-1 on --sv-surface/)]),
    )
  })
})

describe('no hard-coded colours', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sv-kit-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test('in the stylesheet and the font faces', () => {
    const problems = checkSourceColours(
      broken({
        stylesheet: '.x{color:#fff}\n.y{background:rgb(0 0 0)}',
        fonts: { ...plain.fonts, faces: '.z{color:red;}' },
      }),
    )
    expect(problems).toEqual([
      'plain stylesheet:1: hex colour "#fff"',
      'plain stylesheet:2: colour function "rgb("',
      expect.stringMatching(/^plain fonts\.faces:1: named colour/),
    ])
  })

  test('in source files, except the declared token files; a missing source is a problem', () => {
    mkdirSync(join(dir, 'src', 'nested'), { recursive: true })
    writeFileSync(join(dir, 'src', 'tokens.ts'), "export const a = '#123456'\n")
    writeFileSync(join(dir, 'src', 'nested', 'Button.tsx'), 'const c = "text-white"\n')
    writeFileSync(join(dir, 'src', 'notes.md'), '#ffffff is ignored here\n')
    const problems = checkSourceColours(plain, {
      root: dir,
      sources: ['src', 'missing'],
      tokenFiles: ['src/tokens.ts'],
    })
    expect(problems).toEqual([
      expect.stringMatching(/Button\.tsx:1: black\/white class "text-white"$/),
      'source "missing" does not exist',
    ])
  })

  test('catches the forms that used to slip past (regression corpus)', () => {
    const sneaky = [
      `style={{ color: 'red' }}`,
      `style={{ backgroundColor: 'Tomato' }}`,
      `<path fill="white" />`,
      `<circle stroke='rebeccapurple' />`,
      `style={{ border: '1px solid crimson' }}`,
      `className="bg-[red]"`,
      `className="text-[color:tomato]"`,
      `className="bg-[hwb(0_0%_0%)]"`,
      `style={{ background: 'RGB(0 0 0)' }}`,
      `style={{ color: 'color-mix(in srgb, red 40%, white)' }}`,
      `className="inset-shadow-red-500"`,
      `className="border-s-red-500"`,
      `className="md:hover:border-e-black"`,
      `.badge { color: red; }`,
      `.badge { border: 1px solid Navy; }`,
    ]
    for (const source of sneaky)
      expect(findHardCodedColours('x.tsx', source), source).not.toEqual([])
    expect(
      findHardCodedColours(
        'ok.tsx',
        `<div className="border-transparent whitespace-nowrap" style={{ fill: 'currentColor', color: 'var(--sv-danger)' }} aria-label="Redo" />`,
      ),
    ).toEqual([])
  })
})

describe('public override tokens', () => {
  test('a design whose tokens ignore the overrides is caught, per token', () => {
    const problems = checkOverrides(
      broken({
        scale: { ...plain.scale, radiusSm: '3px', radiusMd: '6px', radiusLg: '9px' },
        tokens: {
          light: {
            ...plain.tokens.light,
            color: {
              ...plain.tokens.light.color,
              accent: '#3355cc',
              accentText: '#2244aa',
              ring: '#3355cc',
            },
          },
          dark: plain.tokens.dark,
        },
      }),
    )
    expect(problems).toEqual([
      'light: overriding --brand-hue changes none of --sv-accent, --sv-accent-text, --sv-ring; map it in the tokens',
      'light: overriding --radius changes none of --sv-radius-sm, --sv-radius-md, --sv-radius-lg; map it in the tokens',
      'dark: overriding --radius changes none of --sv-radius-sm, --sv-radius-md, --sv-radius-lg; map it in the tokens',
    ])
  })

  test('a mapped token that the stylesheet never uses changes nothing on screen', () => {
    const problems = checkOverrides(broken({ stylesheet: '.x{display:block}' }))
    expect(problems).toHaveLength(4)
    expect(problems[0]).toMatch(/^the stylesheet never uses var\(--sv-accent/)
  })

  test('the injected stylesheet must carry the overrides', () => {
    expect(checkInjectedOverrides(plain, designStylesheet(plain))).toEqual([
      'the injected stylesheet does not apply the --font-sans override',
      'the injected stylesheet does not apply the --radius override',
    ])
  })
})

describe('overflow at 375 px', () => {
  test('fixed widths wider than a phone are caught; min() and clamp() are fine', () => {
    const problems = checkOverflowStylesheet(
      broken({
        stylesheet:
          '/* width:9999px in a comment */ .a{width:1200px} .b{min-width:400px} .c{width:min(1200px,100%)} .d{max-width:2000px} .e{width:320px}',
      }),
    )
    expect(problems).toEqual([
      'fixed width 1200px is wider than 375px',
      'fixed min-width 400px is wider than 375px',
    ])
  })

  test('DOM: tables must scroll inside a positioned box; main must shrink; no wide inline widths', async () => {
    const Bad = (): ReactElement => (
      <div>
        <style>{'.scroll{overflow-x:auto} main{min-width:auto}'}</style>
        <main>
          <table>
            <tbody />
          </table>
          <div className="scroll">
            <table>
              <tbody />
            </table>
          </div>
          <div style={{ width: '500px' }} />
        </main>
      </div>
    )
    const screen = await mount(<Bad />)
    try {
      expect(checkOverflowDom(screen.container)).toEqual([
        'a table is not inside a horizontal scroll box',
        'a table scrolls inside a box that is not positioned',
        '<main> has min-width "auto", not 0',
        'an element has an inline width of 500px',
      ])
    } finally {
      await screen.unmount()
    }
  })
})

describe('axe on the reference screens', () => {
  test('a skin that drops the wiring it is given is caught', async () => {
    // A Field skin that forgets <label htmlFor>: the inputs lose their accessible names.
    const NoLabel = (props: FieldProps): ReactElement => (
      <div>
        <span>{props.label}</span>
        {props.children}
      </div>
    )
    const screen = await renderReferenceScreen(
      broken({ skins: { ...plain.skins, Field: NoLabel } }),
      'sign-in',
    )
    try {
      const violations = await axeViolations(screen.container)
      expect(violations.some((v) => v.startsWith('label:'))).toBe(true)
    } finally {
      await screen.unmount()
    }
  })

  test('a shell that never shows the page times out with a clear message', async () => {
    const Empty = (_: ShellProps): ReactElement => <div />
    await expect(
      renderReferenceScreen(broken({ shell: { ...plain.shell, Shell: Empty } }), 'detail', {
        timeout: 300,
      }),
    ).rejects.toThrow('reference screen: timed out waiting for the record')
  })
})

describe('the reference API', () => {
  const call = async (
    api: ReturnType<typeof createReferenceApi>,
    path: string,
    init?: RequestInit,
  ) => {
    const r = await api.fetch(path, init)
    const text = await r.text()
    return {
      status: r.status,
      body: text === '' ? undefined : (JSON.parse(text) as Record<string, unknown>),
    }
  }

  test('signed out: 401 everywhere but sign-in; a wrong password is refused', async () => {
    const api = createReferenceApi({ signedIn: false })
    expect((await call(api, '/api/posts')).status).toBe(401)
    expect((await call(api, '/.well-known/strutvane.json')).status).toBe(401)
    const json = { 'content-type': 'application/json' }
    expect(
      (
        await call(api, '/api/auth/sign-in', {
          method: 'POST',
          headers: json,
          body: '{"password":"no"}',
        })
      ).status,
    ).toBe(401)
    const ok = await call(api, '/api/auth/sign-in', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    })
    expect(ok.status).toBe(200)
    expect((await call(api, '/api/auth/me')).status).toBe(200)
    expect((await call(api, '/api/auth/sign-out', { method: 'POST' })).status).toBe(204)
    expect(api.requests.map((r) => r.method)).toContain('POST')
  })

  test('lists filter, search, sort and paginate; too large a page is a 422', async () => {
    const api = createReferenceApi()
    const page = await call(
      api,
      '/api/posts?filter[status][in]=draft&filter[title][contains]=notes&sort=-title&page[size]=5&page[number]=2&page[total]=true',
    )
    expect(page.body?.['meta']).toEqual({ page: { size: 5, number: 2, hasMore: false, total: 10 } })
    const authors = await call(api, '/api/authors?search=asha&filter[id][eq]=1')
    expect((authors.body?.['data'] as unknown[]).length).toBe(1)
    expect((await call(api, '/api/posts?page[size]=60')).status).toBe(422)
    expect((await call(api, '/api/nope')).status).toBe(404)
  })

  test('records by slug or id; create validates; delete, restore and update work', async () => {
    const api = createReferenceApi()
    expect((await call(api, '/api/posts/launch-notes-2')).body?.['id']).toBe('2')
    expect((await call(api, '/api/posts/2')).body?.['slug']).toBe('launch-notes-2')
    expect((await call(api, '/api/posts/none')).status).toBe(404)
    const json = { 'content-type': 'application/json' }
    expect(
      (await call(api, '/api/posts', { method: 'POST', headers: json, body: '{}' })).status,
    ).toBe(422)
    expect(
      (await call(api, '/api/posts', { method: 'POST', headers: json, body: '{"title":"New"}' }))
        .status,
    ).toBe(201)
    expect(
      (await call(api, '/api/posts/2', { method: 'PATCH', headers: json, body: '{"title":"T"}' }))
        .body?.['title'],
    ).toBe('T')
    expect((await call(api, '/api/posts/2', { method: 'DELETE' })).status).toBe(204)
    expect((await call(api, '/api/posts/2')).status).toBe(404)
    expect((await call(api, '/api/posts/2/restore', { method: 'POST' })).status).toBe(200)
    expect((await call(api, '/api/posts/99/restore', { method: 'POST' })).status).toBe(404)
    expect(
      (await call(api, new Request('http://localhost/api/posts/2') as unknown as string)).status,
    ).toBe(200)
  })
})
