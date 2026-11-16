// @vitest-environment jsdom
// Exact numbers travel as strings (a Strutvane decimal is `"1250.50"`, schema `type: "string"`).
// The list showed "—" for every such value and the form sent numbers the API refuses.
import type { FieldDescriptor } from '@strutvane/framework/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { DecimalCell, NumberCell } from '../src/react/cells.tsx'
import { NumberWidget, numericText } from '../src/react/widgets.tsx'
import { invoiceResource } from './fixtures/manifest.ts'
import { renderWithUI } from './helpers.tsx'

const decimalField = (schema: Record<string, unknown>): FieldDescriptor => ({
  name: 'amount',
  type: 'decimal',
  label: 'Amount',
  required: true,
  nullable: false,
  unique: false,
  readOnly: false,
  writeOnce: false,
  filterOperators: [],
  sortable: false,
  searchable: false,
  schema,
})

/** A form-like parent that keeps the widget's value, like ResourceForm does. */
function Harness({ onChange }: { readonly onChange: (v: unknown) => void }) {
  const [value, setValue] = useState<unknown>(null)
  return (
    <NumberWidget
      id="f"
      name="amount"
      invalid={false}
      describedBy={undefined}
      readOnly={false}
      onBlur={() => undefined}
      field={decimalField({ type: 'string' })}
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

describe('decimal values as strings', () => {
  test('cells format numeric strings without losing digits; garbage stays empty', () => {
    const field = decimalField({ type: 'string' })
    const record = { id: 'r1' }
    renderWithUI(
      <>
        <span data-testid="a">
          <DecimalCell field={field} value="1250.5" record={record} resource={invoiceResource} />
        </span>
        <span data-testid="b">
          <DecimalCell
            field={field}
            value="12345678901234567.89"
            record={record}
            resource={invoiceResource}
          />
        </span>
        <span data-testid="c">
          <NumberCell field={field} value="42" record={record} resource={invoiceResource} />
        </span>
        <span data-testid="d">
          <DecimalCell field={field} value="12abc" record={record} resource={invoiceResource} />
        </span>
        <span data-testid="e">
          <DecimalCell field={field} value={7.5} record={record} resource={invoiceResource} />
        </span>
      </>,
    )
    expect(screen.getByTestId('a')).toHaveTextContent('1,250.50')
    expect(screen.getByTestId('b')).toHaveTextContent('12,345,678,901,234,567.89')
    expect(screen.getByTestId('c')).toHaveTextContent('42')
    expect(screen.getByTestId('d')).toHaveTextContent('—')
    expect(screen.getByTestId('e')).toHaveTextContent('7.50')
  })

  test('a decimal with more than two fraction digits shows every digit (never rounded away)', () => {
    // decimal(12,4) exchange rates, quantities…: rounding to 2 digits on screen hides the real
    // value, and two different stored values would look identical.
    const field = decimalField({ type: 'string' })
    const record = { id: 'r1' }
    const cases: [unknown, string][] = [
      ['1.2345', '1.2345'],
      ['0.0001', '0.0001'],
      ['1250.5', '1,250.50'],
      ['12', '12.00'],
      [0.125, '0.125'],
    ]
    for (const [value, text] of cases) {
      const { unmount } = renderWithUI(
        <span data-testid="v">
          <DecimalCell field={field} value={value} record={record} resource={invoiceResource} />
        </span>,
      )
      expect(screen.getByTestId('v')).toHaveTextContent(text)
      unmount()
    }
  })

  test('the number widget sends exact text for string-typed fields and numbers otherwise', () => {
    const onChange = vi.fn()
    renderWithUI(<Harness onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1250.50' } })
    expect(onChange).toHaveBeenLastCalledWith('1250.50')
    fireEvent.change(input, { target: { value: '12.' } })
    expect(onChange).toHaveBeenLastCalledWith('12')
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(onChange).toHaveBeenLastCalledWith('abc')
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  test('numericText normalises separators and signs, keeping digits', () => {
    expect(numericText('+1250.50')).toBe('1250.50')
    expect(numericText('.5')).toBe('0.5')
    expect(numericText('-.5')).toBe('-0.5')
    expect(numericText('1250,5', 'de')).toBe('1250.5')
    expect(numericText('1e3')).toBe('1000')
    expect(numericText('99999999999999999.99')).toBe('99999999999999999.99')
  })
})

describe('the plain design keeps the v1 layout fixes', () => {
  // Layout cannot be measured in jsdom, so these pin the rules that prevent the known defects.
  test('wide tables scroll inside their own positioned box, at every width', async () => {
    const { PLAIN_STYLESHEET } = await import('../src/design/plain/styles.ts')
    const outsideMedia = PLAIN_STYLESHEET.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    const box = /\.svp-table-scroll\{([^}]*)\}/.exec(outsideMedia)?.[1] ?? ''
    expect(box).toMatch(/overflow-x:auto/)
    expect(box).toMatch(/position:relative/)
    expect(outsideMedia).toMatch(/main\{min-width:0/)
  })

  test('each theme tells the browser its colour scheme, so native controls match', async () => {
    const { designStylesheet } = await import('../src/design/stylesheet.ts')
    const { plain } = await import('../src/design/plain/index.ts')
    const css = designStylesheet(plain)
    expect(css).toMatch(/\[data-sv-theme="light"\]\{color-scheme:light;/)
    expect(css).toMatch(/\[data-sv-theme="dark"\]\{color-scheme:dark;/)
  })
})
