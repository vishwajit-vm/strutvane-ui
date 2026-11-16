/**
 * `<CommandPalette>`: Ctrl/Cmd+K (or `/`) opens one box that reaches every screen, every record
 * the viewer may list, and every action (New post, switch theme, keyboard shortcuts).
 *
 * - **ARIA combobox** with a grouped listbox: Arrow keys move the highlight
 *   (`aria-activedescendant`), Enter opens it, Escape closes and returns focus.
 * - **Records:** typing searches each listable, searchable resource on the server (`?search=`,
 *   5 rows each, debounced, at most {@link MAX_SEARCHED_RESOURCES} resources), so only records the
 *   viewer may see appear, exactly as the list would show them. A failing resource is skipped,
 *   never fatal.
 * - **Screens and actions** are matched locally, case-insensitively.
 *
 * @module
 */
import type { ResourceDescriptor } from '@strutvane/framework/contracts'
import { useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, type ReactElement, useId, useMemo, useRef, useState } from 'react'
import { clampPageSize } from '../core/list-state.ts'
import type { SidebarEntry } from '../core/navigation.ts'
import { maxPerPage, recordKey } from '../core/resource-extensions.ts'
import { useStrutvane } from './context.ts'
import { ModalDialog } from './Dialog.tsx'
import { useSkins } from './design-hooks.ts'
import { recordTitle, useDebouncedValue } from './relations.ts'

/** Most resources searched at once for records. */
export const MAX_SEARCHED_RESOURCES = 8
const PER_RESOURCE = 5

/** An action the palette offers. */
export interface PaletteAction {
  readonly id: string
  readonly label: string
  readonly run: () => void
}

/** Props of {@link CommandPalette}. */
export interface CommandPaletteProps {
  readonly onClose: () => void
  /** Screens (the sidebar's entries). */
  readonly screens: readonly SidebarEntry[]
  readonly actions: readonly PaletteAction[]
  /** Go to an in-app path. */
  readonly onNavigate: (path: string) => void
}

interface Item {
  readonly id: string
  readonly group: 'screens' | 'actions' | 'records'
  readonly label: string
  readonly hint?: string
  readonly run: () => void
}

const matches = (text: string, query: string) => text.toLowerCase().includes(query.toLowerCase())

/** The command palette (render it while open). */
export function CommandPalette(props: CommandPaletteProps): ReactElement {
  const { api, manifest, t } = useStrutvane()
  const { Input } = useSkins()
  const ids = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const query = text.trim()
  const debounced = useDebouncedValue(query, 250)

  const searchable = useMemo(
    () =>
      manifest.resources
        .filter((r) => r.capabilities.list && r.fields.some((f) => f.searchable))
        .slice(0, MAX_SEARCHED_RESOURCES),
    [manifest],
  )
  const records = useQuery({
    queryKey: ['strutvane', 'palette', debounced],
    enabled: debounced.length > 0 && searchable.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const results = await Promise.allSettled(
        searchable.map(async (resource: ResourceDescriptor) => {
          const page = await api.list(
            resource.path,
            {
              search: debounced,
              page: {
                kind: 'offset',
                size: clampPageSize(PER_RESOURCE, maxPerPage(resource)),
                number: 1,
              },
            },
            signal,
          )
          return page.data.map((record) => ({ resource, record }))
        }),
      )
      return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    },
  })

  const items: Item[] = [
    ...props.screens
      .filter((s) => query === '' || matches(s.label, query))
      .map(
        (s): Item => ({
          id: `screen-${s.path}`,
          group: 'screens',
          label: s.label,
          run: () => props.onNavigate(s.path),
        }),
      ),
    ...props.actions
      .filter((a) => query === '' || matches(a.label, query))
      .map((a): Item => ({ id: `action-${a.id}`, group: 'actions', label: a.label, run: a.run })),
    ...(query === '' || debounced !== query
      ? []
      : (records.data ?? []).map(
          ({ resource, record }): Item => ({
            id: `record-${resource.path}-${record.id}`,
            group: 'records',
            label: recordTitle(resource, record),
            hint: resource.label,
            run: () =>
              props.onNavigate(
                `/${resource.path}/${encodeURIComponent(recordKey(resource, record))}`,
              ),
          }),
        )),
  ]
  const current = Math.min(active, Math.max(0, items.length - 1))
  const optionId = (i: number) => `${ids}-option-${i}`
  const choose = (item: Item | undefined) => {
    if (!item) return
    props.onClose()
    item.run()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current + 1) % Math.max(1, items.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current - 1 + items.length) % Math.max(1, items.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(items[current])
    }
  }
  const groups = (['screens', 'actions', 'records'] as const).filter((g) =>
    items.some((i) => i.group === g),
  )
  const searching = query !== '' && (debounced !== query || records.isFetching)

  return (
    <ModalDialog
      title={t('ui.palette.open')}
      onClose={props.onClose}
      initialFocus={input}
      size="lg"
    >
      <Input
        ref={input}
        role="combobox"
        aria-label={t('ui.palette.label')}
        aria-expanded={items.length > 0}
        aria-controls={`${ids}-list`}
        aria-autocomplete="list"
        aria-activedescendant={items.length > 0 ? optionId(current) : undefined}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      <div
        id={`${ids}-list`}
        role="listbox"
        aria-label={t('ui.palette.label')}
        data-sv-part="palette-list"
      >
        {groups.map((group) => (
          // biome-ignore lint/a11y/useSemanticElements: an ARIA listbox groups its options with role="group"; <fieldset> is for form controls.
          <div key={group} role="group" aria-labelledby={`${ids}-${group}`}>
            <div id={`${ids}-${group}`} role="presentation" data-sv-part="palette-group">
              {t(`ui.palette.${group}`)}
            </div>
            {items.map((item, i) =>
              item.group === group ? (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input handles the keyboard (aria-activedescendant).
                <div
                  key={item.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === current}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  {item.label}
                  {item.hint ? <span data-sv-part="palette-hint"> · {item.hint}</span> : null}
                </div>
              ) : null,
            )}
          </div>
        ))}
      </div>
      <p role="status" aria-live="polite">
        {searching
          ? t('ui.palette.searching')
          : query !== '' && items.length === 0
            ? t('ui.palette.empty', { query })
            : ''}
      </p>
    </ModalDialog>
  )
}
