// @vitest-environment jsdom
// JSON fields (`type: "json"`, what the framework emits for `field.json()`): the value is JSON, not
// text. A plain text input would send the typed text as a JSON *string*, which the server accepts
// (any JSON is valid), silently replacing an object with a string. These tests pin the round trip.
import type { ResourceManifest } from '@strutvane/framework/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { defaultMessages } from '../src/core/messages.ts'
import { InvalidJsonText, validateField } from '../src/core/validation.ts'
import { ResourceDetail } from '../src/react/ResourceDetail.tsx'
import { ResourceForm } from '../src/react/ResourceForm.tsx'
import { FakeApi } from './fixtures/fake-api.ts'
import { field, manifest, resource } from './fixtures/manifest.ts'
import { axeViolations, renderWithUI } from './helpers.tsx'

const settings = resource({
  name: 'Setting',
  path: 'settings',
  titleField: 'key',
  fields: [
    field({ name: 'id', type: 'id', label: 'ID', readOnly: true }),
    field({ name: 'key', type: 'string', label: 'Key', required: true }),
    field({ name: 'value', type: 'json', label: 'Value', widget: 'json' }),
  ],
})
const withSettings: ResourceManifest = { ...manifest, resources: [...manifest.resources, settings] }
const seeded = () =>
  new FakeApi(withSettings, {
    settings: [{ id: 's1', key: 'theme', value: { dark: true, accent: 'blue' } }],
  })
const valueBox = () => screen.getByLabelText('Value')

describe('JSON fields', () => {
  test('typed JSON is sent as JSON (an object), never as the text', async () => {
    const api = seeded()
    const { container } = renderWithUI(<ResourceForm resource={settings} />, {
      api,
      manifest: withSettings,
    })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Key/), 'limits')
    fireEvent.change(valueBox(), { target: { value: '{"max": 5, "tags": ["a"]}' } })
    await user.click(screen.getByRole('button', { name: 'Create setting' }))
    await waitFor(() => expect(api.rows('settings')).toHaveLength(2))
    expect(api.rows('settings')[1]?.['value']).toEqual({ max: 5, tags: ['a'] })
    expect(await axeViolations(container)).toEqual([])
  })

  test('text that is not JSON is refused before sending, and the typed text is kept', async () => {
    const api = seeded()
    renderWithUI(<ResourceForm resource={settings} />, { api, manifest: withSettings })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Key/), 'broken')
    fireEvent.change(valueBox(), { target: { value: '{max: 5' } })
    await user.click(screen.getByRole('button', { name: 'Create setting' }))
    expect(await screen.findByText('Value must be valid JSON.')).toBeInTheDocument()
    expect(valueBox()).toHaveValue('{max: 5')
    expect(api.mutations).toHaveLength(0)
  })

  test('edit shows the stored JSON; an untouched JSON field is not sent', async () => {
    const api = seeded()
    renderWithUI(<ResourceForm resource={settings} recordId="s1" />, {
      api,
      manifest: withSettings,
    })
    const user = userEvent.setup()
    await waitFor(() => expect(valueBox()).toHaveValue('{\n  "dark": true,\n  "accent": "blue"\n}'))
    await user.clear(screen.getByLabelText(/Key/))
    await user.type(screen.getByLabelText(/Key/), 'look')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.rows('settings')[0]?.['key']).toBe('look'))
    expect(api.rows('settings')[0]?.['value']).toEqual({ dark: true, accent: 'blue' })
  })

  test('the detail page shows the JSON instead of an empty dash', async () => {
    renderWithUI(<ResourceDetail resource={settings} recordId="s1" />, {
      api: seeded(),
      manifest: withSettings,
    })
    expect(await screen.findByText('{"dark":true,"accent":"blue"}')).toBeInTheDocument()
  })

  test('validation: only unparseable text is refused; any JSON value is fine', () => {
    const f = settings.fields[2]
    if (!f) throw new Error('fixture')
    expect(validateField(f, new InvalidJsonText('{'), defaultMessages)[0]?.code).toBe(
      'invalid_json',
    )
    for (const ok of [{ a: 1 }, [1], 'text', 3, true, null])
      expect(validateField(f, ok, defaultMessages)).toEqual([])
  })
})
