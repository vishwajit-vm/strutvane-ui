// The v2 core: CSRF header, sidebar model, the shortcut rule, list preferences, manifest extras and
// the problem changes (#118 path→field, #103 write_cancelled, #68 code casing, 419).
import type { ResourceManifest } from '@strutvane/framework/contracts'
import { describe, expect, test, vi } from 'vitest'
import { defaultMessages } from '../../src/core/messages.ts'
import {
  groupSidebar,
  isCurrentPath,
  type SidebarEntry,
  sidebarEntries,
} from '../../src/core/navigation.ts'
import {
  catalogKey,
  fieldToPath,
  problemBannerText,
  sanitizeProblem,
  syntheticProblem,
} from '../../src/core/problems.ts'
import {
  extrasOf,
  maxPerPage,
  recordKey,
  withUiExtensions,
} from '../../src/core/resource-extensions.ts'
import {
  createSequenceMatcher,
  documentHasModal,
  isPaletteChord,
  isTypingTarget,
  shortcutBlocked,
} from '../../src/core/shortcuts.ts'
import {
  browserStorage,
  DEFAULT_VIEW_PREFS,
  loadViewPrefs,
  parseViewPrefs,
  saveViewPrefs,
} from '../../src/core/view-prefs.ts'
import { isUnsafeMethod, readCookie, xsrfHeaders } from '../../src/core/xsrf.ts'
import { customerResource, invoiceResource, manifest } from '../fixtures/manifest.ts'

describe('CSRF header (decision #17)', () => {
  test('readCookie finds one cookie, decodes it, and refuses malformed or empty values', () => {
    expect(readCookie('a=1; XSRF-TOKEN=abc%3D; b=2', 'XSRF-TOKEN')).toBe('abc=')
    expect(readCookie('XSRF-TOKEN=', 'XSRF-TOKEN')).toBeUndefined()
    expect(readCookie('XSRF-TOKEN=%E0%A4%A', 'XSRF-TOKEN')).toBeUndefined()
    expect(readCookie('junk; other=1', 'XSRF-TOKEN')).toBeUndefined()
    expect(readCookie('MY-XSRF-TOKEN=x', 'XSRF-TOKEN')).toBeUndefined()
  })

  test('only unsafe methods carry the header; GET, HEAD and OPTIONS never do', () => {
    for (const m of ['POST', 'put', 'PATCH', 'DELETE']) expect(isUnsafeMethod(m)).toBe(true)
    for (const m of ['GET', 'head', 'OPTIONS']) expect(isUnsafeMethod(m)).toBe(false)
    const readCookies = () => 'XSRF-TOKEN=t1'
    expect(xsrfHeaders('POST', { readCookies })).toEqual({ 'X-XSRF-TOKEN': 't1' })
    expect(xsrfHeaders('GET', { readCookies })).toEqual({})
    expect(xsrfHeaders('POST', false)).toEqual({})
    expect(xsrfHeaders('POST', { readCookies: () => '' })).toEqual({})
    expect(
      xsrfHeaders('DELETE', { readCookies: () => 'csrf=x', cookie: 'csrf', header: 'X-CSRF' }),
    ).toEqual({ 'X-CSRF': 'x' })
  })

  test('the default reads document.cookie, and is empty without a document', () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=from-doc' })
    expect(xsrfHeaders('PATCH')).toEqual({ 'X-XSRF-TOKEN': 'from-doc' })
    vi.stubGlobal('document', undefined)
    expect(xsrfHeaders('PATCH')).toEqual({})
  })
})

describe('sidebar entries (decision #50)', () => {
  const page = (over: Partial<SidebarEntry>): SidebarEntry => ({
    name: 'x',
    label: 'X',
    path: '/x',
    icon: 'file',
    group: undefined,
    order: undefined,
    permission: 'x.view',
    ...over,
  })

  test('one entry per listable resource, in the decision #50 shape', () => {
    const m: ResourceManifest = {
      ...manifest,
      resources: [
        withUiExtensions(invoiceResource, { ui: { order: 2, badge: 7 } }),
        { ...customerResource, capabilities: { ...customerResource.capabilities, list: false } },
      ],
    }
    expect(sidebarEntries(m)).toEqual([
      {
        name: 'Invoice',
        label: invoiceResource.pluralLabel,
        path: '/invoices',
        icon: invoiceResource.ui?.icon ?? 'table',
        group: invoiceResource.ui?.group,
        order: 2,
        badge: 7,
        permission: 'invoices.viewAny',
      },
    ])
  })

  test('package pages show only when can(permission) says yes, and never off-site', () => {
    const logs = page({ name: 'logs', path: '/logs', permission: 'logs.view' })
    const evil = page({ name: 'evil', path: '//evil.example', permission: 'logs.view' })
    expect(sidebarEntries(manifest, { extra: [logs, evil] }).map((e) => e.name)).not.toContain(
      'logs',
    )
    const allowed = sidebarEntries(manifest, { extra: [logs, evil], can: () => true })
    expect(allowed.map((e) => e.name)).toContain('logs')
    expect(allowed.map((e) => e.name)).not.toContain('evil')
  })

  test('ungrouped first, then groups by lowest order then name; inside: order, then A to Z', () => {
    const entries = [
      page({ name: 'b', label: 'Beta', group: 'Zed', order: 1 }),
      page({ name: 'a', label: 'Alpha', group: 'Zed' }),
      page({ name: 'c', label: 'Gamma', group: 'Ann' }),
      page({ name: 'd', label: 'Delta', group: 'Bob' }),
      page({ name: 'top2', label: 'Second', order: 5 }),
      page({ name: 'top1', label: 'First', order: 1 }),
      page({ name: 'top3', label: 'Aardvark' }),
    ]
    expect(groupSidebar(entries).map((g) => [g.label, g.entries.map((e) => e.name)])).toEqual([
      [undefined, ['top1', 'top2', 'top3']],
      ['Zed', ['b', 'a']],
      ['Ann', ['c']],
      ['Bob', ['d']],
    ])
    expect(groupSidebar([page({ group: 'Only' })])[0]?.label).toBe('Only')
  })

  test('isCurrentPath matches the page and pages inside it, nothing else', () => {
    expect(isCurrentPath('/posts', '/posts')).toBe(true)
    expect(isCurrentPath('/posts', '/posts/12/edit')).toBe(true)
    expect(isCurrentPath('/posts', '/postscript')).toBe(false)
  })
})

describe('the shortcut rule (shortcutBlocked)', () => {
  const ev = (over: Partial<Parameters<typeof shortcutBlocked>[0]> = {}) => ({
    key: 'n',
    target: { tagName: 'DIV' },
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    defaultPrevented: false,
    ...over,
  })

  test('typing targets: inputs that take text, textarea, select, contenteditable', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTypingTarget({ tagName: 'input' })).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget('x')).toBe(false)
  })

  test('blocked while typing, under a modal, composing, already handled, or with a modifier', () => {
    expect(shortcutBlocked(ev(), false)).toBe(false)
    expect(shortcutBlocked(ev({ target: { tagName: 'INPUT' } }), false)).toBe(true)
    expect(shortcutBlocked(ev(), true)).toBe(true)
    expect(shortcutBlocked(ev({ isComposing: true }), false)).toBe(true)
    expect(shortcutBlocked(ev({ defaultPrevented: true }), false)).toBe(true)
    expect(shortcutBlocked(ev({ ctrlKey: true }), false)).toBe(true)
    expect(shortcutBlocked(ev({ altKey: true }), false)).toBe(true)
    expect(shortcutBlocked(ev({ metaKey: true }), false)).toBe(true)
  })

  test('without a document there is no modal', () => {
    vi.stubGlobal('document', undefined)
    expect(documentHasModal()).toBe(false)
    expect(shortcutBlocked(ev())).toBe(false)
  })

  test('the palette chord is Ctrl+K or Cmd+K, never with Alt', () => {
    expect(isPaletteChord({ key: 'k', ctrlKey: true, metaKey: false, altKey: false })).toBe(true)
    expect(isPaletteChord({ key: 'K', ctrlKey: false, metaKey: true, altKey: false })).toBe(true)
    expect(isPaletteChord({ key: 'k', ctrlKey: true, metaKey: false, altKey: true })).toBe(false)
    expect(isPaletteChord({ key: 'k', ctrlKey: false, metaKey: false, altKey: false })).toBe(false)
  })

  test('sequences: g then d completes; a pause, a wrong key or reset() starts over', () => {
    const m = createSequenceMatcher({ home: ['g', 'd'], help: ['g', 'h'] }, 1000)
    expect(m.push('g', 0)).toBeUndefined()
    expect(m.push('d', 100)).toBe('home')
    expect(m.push('g', 200)).toBeUndefined()
    expect(m.push('d', 1500)).toBeUndefined() // too slow
    expect(m.push('x', 1600)).toBeUndefined()
    expect(m.push('g', 1700)).toBeUndefined()
    expect(m.push('g', 1800)).toBeUndefined() // g g: the second g can still start a sequence
    expect(m.push('h', 1900)).toBe('help')
    m.push('g', 2000)
    m.reset()
    expect(m.push('d', 2100)).toBeUndefined()
  })
})

describe('list preferences', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  test('parse: garbage and missing values fall back to the defaults', () => {
    expect(parseViewPrefs(null)).toBe(DEFAULT_VIEW_PREFS)
    expect(parseViewPrefs('{oops')).toBe(DEFAULT_VIEW_PREFS)
    expect(parseViewPrefs('42')).toBe(DEFAULT_VIEW_PREFS)
    expect(parseViewPrefs('{"hidden":"x","density":"huge"}')).toEqual({
      hidden: [],
      density: 'default',
    })
    expect(parseViewPrefs('{"hidden":["a",1,"b"],"density":"compact"}')).toEqual({
      hidden: ['a', 'b'],
      density: 'compact',
    })
  })

  test('save then load round-trips per resource', () => {
    const storage = memory()
    expect(saveViewPrefs('invoices', { hidden: ['notes'], density: 'compact' }, storage)).toBe(true)
    expect(loadViewPrefs('invoices', storage)).toEqual({ hidden: ['notes'], density: 'compact' })
    expect(loadViewPrefs('customers', storage)).toBe(DEFAULT_VIEW_PREFS)
  })

  test('blocked or full storage never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadViewPrefs('x', broken)).toBe(DEFAULT_VIEW_PREFS)
    expect(saveViewPrefs('x', DEFAULT_VIEW_PREFS, broken)).toBe(false)
    expect(saveViewPrefs('x', DEFAULT_VIEW_PREFS, undefined)).toBe(false)
    expect(loadViewPrefs('x', undefined)).toBe(DEFAULT_VIEW_PREFS)
  })

  test('browserStorage: missing storage, and storage whose access throws, are undefined', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(browserStorage()).toBeUndefined()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    expect(browserStorage()).toBeUndefined()
    Reflect.deleteProperty(globalThis, 'localStorage')
  })
})

describe('manifest extras: maxPerPage, routeKey, sidebar order and badge', () => {
  const posts = {
    ...invoiceResource,
    fields: [
      ...invoiceResource.fields,
      { ...invoiceResource.fields[0], name: 'slug', type: 'slug', unique: true },
      { ...invoiceResource.fields[0], name: 'code', type: 'string', unique: false },
    ],
  } as typeof invoiceResource

  test('valid extras are kept', () => {
    const r = withUiExtensions(posts, {
      maxPerPage: 50,
      routeKey: 'slug',
      ui: { order: 3, badge: 'new' },
    })
    expect(extrasOf(r)).toMatchObject({ maxPerPage: 50, routeKey: 'slug', navOrder: 3 })
    expect(maxPerPage(r)).toBe(50)
    expect(recordKey(r, { id: '7', slug: 'hello-world' })).toBe('hello-world')
    expect(recordKey(r, { id: '7', slug: '' })).toBe('7')
    expect(recordKey(r, { id: '7' })).toBe('7')
  })

  test('invalid extras are ignored, never trusted', () => {
    for (const bad of [0, 101, 2.5, '50']) {
      expect(maxPerPage(withUiExtensions(posts, { maxPerPage: bad }))).toBeUndefined()
    }
    // A route key must be a unique text field of the resource.
    expect(extrasOf(withUiExtensions(posts, { routeKey: 'nope' })).routeKey).toBeUndefined()
    expect(extrasOf(withUiExtensions(posts, { routeKey: 'code' })).routeKey).toBeUndefined()
    expect(extrasOf(withUiExtensions(posts, { routeKey: 42 })).routeKey).toBeUndefined()
    const ui = extrasOf(withUiExtensions(posts, { ui: { order: 'x', badge: 'x'.repeat(21) } }))
    expect(ui.navOrder).toBeUndefined()
    expect(ui.navBadge).toBeUndefined()
    expect(recordKey(invoiceResource, { id: '1', slug: 'x' })).toBe('1')
  })
})

describe('problems v2', () => {
  test('fieldToPath turns the dotted convenience into a path (#69)', () => {
    expect(fieldToPath('items.0.title')).toEqual(['items', 0, 'title'])
    expect(fieldToPath('')).toEqual([])
    expect(fieldToPath('a..b')).toBeUndefined()
    expect(fieldToPath('a.01')).toEqual(['a', '01'])
  })

  test('issues read path first, then field (#118); malformed ones are dropped', () => {
    const p = sanitizeProblem({
      type: 'about:blank',
      title: 'Invalid',
      status: 422,
      code: 'validation_failed',
      issues: [
        { path: ['lines', 1, 'amount'], field: 'ignored', code: 'too_small', message: 'A' },
        { field: 'items.0.title', code: 'required', message: 'B' },
        { field: 'a..b', code: 'x', message: 'C' },
        { path: ['ok', -1], code: 'x', message: 'D' },
        { code: 'x', message: 'no location' },
      ],
    })
    expect(p?.issues?.map((i) => [i.path, i.message])).toEqual([
      [['lines', 1, 'amount'], 'A'],
      [['items', 0, 'title'], 'B'],
    ])
  })

  test('codes match the catalogue in any case (#68)', () => {
    expect(catalogKey(defaultMessages, 'NOT_FOUND')).toBe('ui.problem.code.not_found')
    expect(catalogKey(defaultMessages, 'not_found')).toBe('ui.problem.code.not_found')
    expect(catalogKey(defaultMessages, 'NOPE')).toBeUndefined()
    expect(catalogKey({ 'ui.problem.code.CUSTOM': 'x' }, 'CUSTOM')).toBe('ui.problem.code.CUSTOM')
  })

  test('write_cancelled always says clearly what happened (#103), even with a server detail', () => {
    const text = problemBannerText(
      {
        type: 'about:blank',
        title: 'Cancelled',
        status: 422,
        code: 'write_cancelled',
        detail: 'Hook returned false',
      },
      defaultMessages,
    )
    expect(text).toMatch(/stopped by a rule in the app before it was saved, so nothing changed/)
  })

  test('a 419 without a body is a CSRF refusal with a reload hint (#30)', () => {
    const p = syntheticProblem(419)
    expect(p.code).toBe('csrf_token_mismatch')
    expect(problemBannerText(p, defaultMessages)).toMatch(/This page has expired. Reload the page/)
  })

  test('other 4xx keep the server detail first, then the catalogue, then the title', () => {
    const base = { type: 'about:blank', title: 'Gone', status: 404, code: 'NOT_FOUND' }
    expect(problemBannerText({ ...base, detail: 'Server says' }, defaultMessages)).toBe(
      'Server says',
    )
    expect(problemBannerText(base, defaultMessages)).toBe('This record no longer exists.')
    expect(problemBannerText({ ...base, code: 'other' }, defaultMessages)).toBe('Gone')
  })
})
