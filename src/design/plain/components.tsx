/**
 * The plain design's slots: the smallest correct markup for each part, styled by `styles.ts`.
 *
 * Every slot spreads the prop bags it receives and places the ids it is given, so the behaviour's
 * accessibility wiring arrives intact. Class names start with `svp-` (plain), so they can't clash
 * with an app's own classes.
 *
 * @module
 */
import type { ReactElement } from 'react'
import type {
  AlertProps,
  AuthLayoutProps,
  BadgeProps,
  ButtonProps,
  CardProps,
  CheckboxProps,
  ChipProps,
  DialogProps,
  FieldProps,
  IconProps,
  IllustrationProps,
  InputProps,
  PageHeaderProps,
  PopoverProps,
  SelectProps,
  ShellProps,
  SidebarProps,
  SkeletonProps,
  TableProps,
  TextareaProps,
  ToastProps,
  TopBarProps,
} from '../slots.ts'

const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ')

/** Page frame: sidebar column, top bar and main area; the sidebar is a drawer on narrow screens. */
export function Shell(props: ShellProps): ReactElement {
  return (
    <div className="svp-shell" data-sv-part="shell" data-nav-open={props.navOpen || undefined}>
      {props.skipLink}
      {props.navOpen ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: the scrim only mirrors the close button for pointer users.
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the close button already close the drawer.
        <div className="svp-scrim" data-sv-part="scrim" onClick={props.onCloseNav} />
      ) : null}
      <div className="svp-shell-nav">{props.sidebar}</div>
      <div className="svp-shell-body">
        {props.topBar}
        {props.main}
      </div>
    </div>
  )
}

/** The sidebar: brand, then one list per group. */
export function Sidebar({ label, brand, groups, Link }: SidebarProps): ReactElement {
  return (
    <nav aria-label={label} className="svp-sidebar" data-sv-part="sidebar">
      <div className="svp-brand">{brand}</div>
      {groups.map((group) => (
        <div key={group.label ?? '_top'} className="svp-nav-group">
          {group.label ? <p className="svp-nav-heading">{group.label}</p> : null}
          <ul>
            {group.links.map((link) => (
              <li key={link.entry.path}>
                <Link to={link.entry.path} current={link.current} aria-label={link.accessibleName}>
                  <span>{link.entry.label}</span>
                  {link.entry.badge !== undefined ? (
                    <span className="svp-nav-badge" aria-hidden="true">
                      {link.entry.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** The top bar. */
export function TopBar(props: TopBarProps): ReactElement {
  return (
    <header className="svp-topbar" data-sv-part="topbar">
      {props.menuButton}
      <div className="svp-topbar-search">{props.search}</div>
      <div className="svp-topbar-actions">{props.actions}</div>
    </header>
  )
}

/** The signed-out frame: a centred card. */
export function AuthLayout(props: AuthLayoutProps): ReactElement {
  return (
    <div className="svp-auth" data-sv-part="auth">
      <p className="svp-auth-app">{props.appName}</p>
      <div className="svp-auth-card">{props.children}</div>
    </div>
  )
}

/** Breadcrumbs, then back, title and actions on one row (actions wrap on phones). */
export function PageHeader(props: PageHeaderProps): ReactElement {
  return (
    <div className="svp-page-header" data-sv-part="page-header">
      {props.breadcrumbs}
      <div className="svp-page-header-row">
        {props.back}
        <h1 id={props.titleId}>{props.title}</h1>
        {props.meta ? <span className="svp-page-meta">{props.meta}</span> : null}
        {props.actions ? <div className="svp-page-actions">{props.actions}</div> : null}
      </div>
    </div>
  )
}

/** A button; `type="button"` unless told otherwise. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: _icon,
  className,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={cx('svp-button', `svp-button-${variant}`, size === 'sm' && 'svp-sm', className)}
      {...rest}
    />
  )
}

/** A text-like input. */
export function Input({ className, ...rest }: InputProps): ReactElement {
  return <input className={cx('svp-input', className)} {...rest} />
}

/** A multi-line input. */
export function Textarea({ className, ...rest }: TextareaProps): ReactElement {
  return <textarea className={cx('svp-input', className)} {...rest} />
}

/** A native select. */
export function Select({ className, ...rest }: SelectProps): ReactElement {
  return <select className={cx('svp-input', className)} {...rest} />
}

/** A checkbox. */
export function Checkbox({ className, ...rest }: CheckboxProps): ReactElement {
  return <input type="checkbox" className={cx('svp-checkbox', className)} {...rest} />
}

/** Label, control, help and error. */
export function Field(props: FieldProps): ReactElement {
  return (
    <div className="svp-field" data-sv-field={props.name}>
      <label htmlFor={props.htmlFor}>
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {props.children}
      {props.help ? (
        <p id={props.helpId} className="svp-help">
          {props.help}
        </p>
      ) : null}
      {props.error ? (
        <p id={props.errorId} className="svp-error">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

/** A surface. */
export function Card({ heading, className, children, ...rest }: CardProps): ReactElement {
  return (
    <section className={cx('svp-card', className)} {...rest}>
      {heading}
      {children}
    </section>
  )
}

/** A small status label. */
export function Badge({ tone, children }: BadgeProps): ReactElement {
  return <span className={cx('svp-badge', `svp-tone-${tone}`)}>{children}</span>
}

/** A message block. */
export function Alert({ tone, className, ...rest }: AlertProps): ReactElement {
  return <div className={cx('svp-alert', `svp-tone-${tone}`, className)} {...rest} />
}

/** A table in a scroll box (the box scrolls sideways; the page never does). */
export function Table({ regionProps, tableProps, density, children }: TableProps): ReactElement {
  return (
    <div className="svp-table-scroll" data-sv-part="table-scroll" {...regionProps}>
      <table className="svp-table" data-sv-density={density} {...tableProps}>
        {children}
      </table>
    </div>
  )
}

/** A modal dialog over a scrim. */
export function Dialog(props: DialogProps): ReactElement {
  return (
    <div className="svp-overlay" data-sv-part="overlay" {...props.overlayProps}>
      <div
        className={cx('svp-dialog', `svp-dialog-${props.size ?? 'md'}`)}
        data-sv-part="dialog"
        {...props.panelProps}
      >
        <h2 id={props.titleId}>{props.title}</h2>
        {props.description ? <p id={props.descriptionId}>{props.description}</p> : null}
        {props.children}
        {props.footer ? <div className="svp-dialog-footer">{props.footer}</div> : null}
      </div>
    </div>
  )
}

/** A floating panel. */
export function Popover({ panelProps, children }: PopoverProps): ReactElement {
  return (
    <div className="svp-popover" data-sv-part="popover" {...panelProps}>
      {children}
    </div>
  )
}

/** One toast. */
export function Toast({ tone, children, action, dismiss }: ToastProps): ReactElement {
  return (
    <div className={cx('svp-toast', `svp-tone-${tone}`)} data-sv-part="toast">
      <span>{children}</span>
      {action}
      {dismiss}
    </div>
  )
}

/** An active filter. */
export function Chip({ children, remove }: ChipProps): ReactElement {
  return (
    <span className="svp-chip" data-sv-part="chip">
      <span>{children}</span>
      {remove}
    </span>
  )
}

/** Loading lines. */
export function Skeleton({ lines }: SkeletonProps): ReactElement {
  return (
    <div className="svp-skeleton" aria-hidden="true">
      {Array.from({ length: Math.max(1, Math.min(lines, 20)) }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder lines have no identity.
        <span key={i} />
      ))}
    </div>
  )
}

/** The plain design draws no icons: labels carry the meaning. */
export function Icon(_props: IconProps): null {
  return null
}

/** The plain design has no illustrations. */
export function NoIllustration(_props: IllustrationProps): null {
  return null
}
