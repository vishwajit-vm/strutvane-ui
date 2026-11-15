// @vitest-environment jsdom
// Datetime fields (`type: "datetime"`): an INSTANT, exchanged as ISO-8601 with an offset. It must be
// shown and edited in the viewer's time zone and sent back as an instant; a plain text input showed
// the raw UTC text, and anything typed without an offset was refused by the API.
import type { ResourceManifest } from '@strutvane/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ResourceDetail } from '../src/react/ResourceDetail.tsx'
import { ResourceForm } from '../src/react/ResourceForm.tsx'
import { fromLocalInput, toLocalInput } from '../src/react/widgets.tsx'
import { FakeApi } from './fixtures/fake-api.ts'
import { field, manifest, resource } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI } from './helpers.tsx'

const meetings = resource({
  name: 'Meeting',
  path: 'meetings',
  titleField: 'title',
  fields: [
    field({ name: 'id', type: 'id', label: 'ID', readOnly: true }),
    field({ name: 'title', type: 'string', label: 'Title', required: true }),
    field({ name: 'startsAt', type: 'datetime', label: 'Starts at', widget: 'datetime' }),
  ],
})
const withMeetings: ResourceManifest = { ...manifest, resources: [...manifest.resources, meetings] }
const seeded = () =>
  new FakeApi(withMeetings, {
    meetings: [{ id: 'm1', title: 'Kick-off', startsAt: '2026-11-14T08:30:00.000Z' }],
  })

// India is UTC+05:30 all year (no DST), so the expected wall-clock times are stable.
beforeEach(() => vi.stubEnv('TZ', 'Asia/Kolkata'))
afterEach(() => vi.unstubAllEnvs())

describe('datetime fields use the viewer time zone and send instants', () => {
  test('conversion helpers: instant ⇄ local wall clock', () => {
    expect(toLocalInput('2026-11-14T08:30:00.000Z')).toBe('2026-11-14T14:00')
    expect(toLocalInput('2026-11-14T08:30:15.000Z')).toBe('2026-11-14T14:00:15')
    expect(toLocalInput('not a date')).toBe('')
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('2026-11-14T14:00')).toBe('2026-11-14T08:30:00.000Z')
    expect(fromLocalInput('')).toBeNull()
  })

  test('the form shows the local time and sends an ISO instant the API accepts', async () => {
    const api = seeded()
    const { container } = renderWithUI(<ResourceForm resource={meetings} recordId="m1" />, {
      api,
      manifest: withMeetings,
    })
    const input = await screen.findByLabelText('Starts at')
    expect(input).toHaveAttribute('type', 'datetime-local')
    expect(input).toHaveValue('2026-11-14T14:00')
    fireEvent.change(input, { target: { value: '2026-11-15T09:15' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.rows('meetings')[0]?.['startsAt']).toBe('2026-11-15T03:45:00.000Z'),
    )
    expect(await axeViolations(container)).toEqual([])
  })

  test('the detail page formats the instant in the viewer time zone, keeping the exact value', async () => {
    renderWithUI(<ResourceDetail resource={meetings} recordId="m1" />, {
      api: seeded(),
      manifest: withMeetings,
    })
    const time = await waitFor(() => {
      const el = document.querySelector('time')
      if (!el) throw new Error('no <time>')
      return el
    })
    expect(time).toHaveAttribute('dateTime', '2026-11-14T08:30:00.000Z')
    expect(time.textContent).toMatch(/2:00\s?PM/)
    expect(time.textContent).toMatch(/Nov 14, 2026/)
  })
})
