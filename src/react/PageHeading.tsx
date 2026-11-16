/**
 * `<PageHeading>`: the top of every page (breadcrumbs, Back, the `<h1>`, actions), drawn by the
 * design's `PageHeader` slot.
 *
 * - **Breadcrumbs:** a `<nav>` with an ordered list; the last crumb is the current page
 *   (`aria-current="page"`, not a link).
 * - **Back** (spike 14 P0): when the previous history entry is a page of this app it goes back,
 *   so the list returns with its page, filters and sort from its URL; on a direct link it goes to
 *   the parent page instead of leaving the app. Alt+← does the same (see the shortcuts).
 *
 * @module
 */
import { type ReactElement, type ReactNode, useId } from 'react'
import { useStrutvane } from './context.ts'
import { useShellSlots, useSkins } from './design-hooks.ts'
import { Link, useOptionalRouter } from './router.tsx'

/** One breadcrumb; the last one is the current page. */
export interface Crumb {
  readonly label: string
  /** Where the crumb links to (ignored for the last crumb). */
  readonly to?: string
}

/** Props of {@link PageHeading}. */
export interface PageHeadingProps {
  readonly title: ReactNode
  /** Put on the `<h1>` so regions can be labelled by it; generated when omitted. */
  readonly titleId?: string
  readonly breadcrumbs?: readonly Crumb[]
  /** The parent page for Back when there is no in-app history; no Back control when omitted. */
  readonly parent?: { readonly to: string; readonly label: string }
  readonly actions?: ReactNode
  readonly meta?: ReactNode
}

/** Breadcrumbs, Back, title and actions of a page. */
export function PageHeading(props: PageHeadingProps): ReactElement {
  const { PageHeader } = useShellSlots()
  const generated = useId()
  const { t } = useStrutvane()
  const crumbs = props.breadcrumbs ?? []
  return (
    <PageHeader
      title={props.title}
      titleId={props.titleId ?? generated}
      breadcrumbs={
        crumbs.length > 1 ? (
          <nav aria-label={t('ui.nav.breadcrumbs')} data-sv-part="breadcrumbs">
            <ol>
              {crumbs.map((crumb, i) => (
                <li key={crumb.to ?? `current-${crumb.label}`}>
                  {i === crumbs.length - 1 || crumb.to === undefined ? (
                    <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                      {crumb.label}
                    </span>
                  ) : (
                    <CrumbLink to={crumb.to}>{crumb.label}</CrumbLink>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null
      }
      back={props.parent ? <BackButton parent={props.parent} /> : null}
      actions={props.actions ?? null}
      meta={props.meta ?? null}
    />
  )
}

/** A crumb link: a router link inside the app, a plain anchor outside it. */
function CrumbLink(props: { readonly to: string; readonly children: ReactNode }): ReactElement {
  const router = useOptionalRouter()
  return router ? (
    <Link to={props.to}>{props.children}</Link>
  ) : (
    <a href={props.to}>{props.children}</a>
  )
}

/** The Back control (see the module comment). */
export function BackButton(props: {
  readonly parent: { readonly to: string; readonly label: string }
}): ReactElement {
  const { Button } = useSkins()
  const { t } = useStrutvane()
  const router = useOptionalRouter()
  const label = t('ui.nav.backTo', { page: props.parent.label })
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="arrow-left"
      data-sv-part="back"
      aria-label={label}
      title={label}
      onClick={() => {
        if (!router) return
        if (router.canGoBack) router.back()
        else router.navigate(props.parent.to)
      }}
    >
      {t('ui.nav.back')}
    </Button>
  )
}
