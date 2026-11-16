/**
 * The slots of the Design contract: the components a design provides, and exactly what each one
 * receives from the behaviour.
 *
 * The split: `@strutvane/ui` owns WHAT happens (data, state, keyboard, focus, ARIA wiring, every
 * convenience); a design owns HOW it looks (markup structure for its parts, class names, CSS). So
 * the behaviour hands each slot ready-made pieces: prop bags to spread (`panelProps`,
 * `regionProps`), ids to place (`titleId`, `helpId`), and nodes to position (`breadcrumbs`,
 * `actions`). A slot must spread the bags and place the ids it is given; the conformance kit's
 * axe pass catches a design that drops them.
 *
 * Every slot is a plain function component. Slots never fetch, never keep app state and never
 * read the manifest.
 *
 * @module
 */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import type { SidebarEntry } from '../core/navigation.ts'
import type { Density } from '../core/view-prefs.ts'

// ─── Shell ───────────────────────────────────────────────────────────────────────────────────────

/** Props of the `Shell` slot: the page frame around every signed-in screen. */
export interface ShellProps {
  /** The skip link; render it first, so it is the first Tab stop. */
  readonly skipLink: ReactNode
  /** The rendered `Sidebar` slot. */
  readonly sidebar: ReactNode
  /** The rendered `TopBar` slot. */
  readonly topBar: ReactNode
  /** The `<main>` landmark with the page; place it as given. */
  readonly main: ReactNode
  /** On narrow screens the sidebar is a drawer: whether it is open. */
  readonly navOpen: boolean
  /** Close the drawer (scrim click). */
  readonly onCloseNav: () => void
}

/** Props of the link component the `Sidebar` slot receives (it sets `aria-current` itself). */
export interface NavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly to: string
  readonly current: boolean
}

/** One sidebar link as the behaviour hands it over. */
export interface SidebarLinkView {
  readonly entry: SidebarEntry
  /** Whether this is the current page (or a page inside it). */
  readonly current: boolean
  /** Accessible name including the badge, such as `Posts, 35`. */
  readonly accessibleName: string
}

/** Props of the `Sidebar` slot. */
export interface SidebarProps {
  /** `aria-label` of the `<nav>` the slot renders. */
  readonly label: string
  /** The app name or logo area. */
  readonly brand: ReactNode
  /** Groups in display order; the first may have no label (the top section). */
  readonly groups: readonly {
    readonly label: string | undefined
    readonly links: readonly SidebarLinkView[]
  }[]
  /** Render every link with this component (client-side navigation, `aria-current`). */
  readonly Link: ComponentType<NavLinkProps>
  /** Draws an icon by name; decorative. Same as the `Icon` skin. */
  readonly Icon: ComponentType<IconProps>
}

/** Props of the `TopBar` slot. */
export interface TopBarProps {
  /** The button that opens the sidebar drawer on narrow screens. */
  readonly menuButton: ReactNode
  /** The search / command palette trigger. */
  readonly search: ReactNode
  /** Theme switch, workspace picker, account menu, in that order. */
  readonly actions: ReactNode
}

/** Props of the `AuthLayout` slot: the frame of sign-in and other signed-out screens. */
export interface AuthLayoutProps {
  readonly appName: string
  /** The form card contents (heading, fields, buttons). */
  readonly children: ReactNode
}

/** Props of the `PageHeader` slot: breadcrumbs, back, title and actions of every page. */
export interface PageHeaderProps {
  /** Text of the page's `<h1>`. */
  readonly title: ReactNode
  /** Put this id on the `<h1>`; regions are labelled by it. */
  readonly titleId: string
  /** The breadcrumb `<nav>`, or `null` on top-level pages. */
  readonly breadcrumbs: ReactNode
  /** The Back control, or `null`. */
  readonly back: ReactNode
  /** Page actions (New, Edit, Delete…), or `null`. */
  readonly actions: ReactNode
  /** A count, status or short description next to the title, or `null`. */
  readonly meta?: ReactNode
}

// ─── Skins ───────────────────────────────────────────────────────────────────────────────────────

/** Button looks. Use one `primary` per view; `danger` only inside confirmations. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/** Props of the `Button` skin: render a `<button>` and spread everything else onto it. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: 'sm' | 'md'
  /** An icon name drawn before the label (decorative). */
  readonly icon?: string
  readonly ref?: Ref<HTMLButtonElement>
}

/** Props of the `Input` skin: render an `<input>` and spread everything onto it. */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly ref?: Ref<HTMLInputElement>
}

/** Props of the `Textarea` skin. */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly ref?: Ref<HTMLTextAreaElement>
}

/** Props of the `Select` skin (a native `<select>`; `children` are its options). */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly ref?: Ref<HTMLSelectElement>
}

/** Props of the `Checkbox` skin: render `<input type="checkbox">` with the rest spread on it. */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly ref?: Ref<HTMLInputElement>
}

/** Props of the `Field` skin: label, control, help and error of one form field. */
export interface FieldProps {
  /** Label text; render it in `<label htmlFor={htmlFor}>`. */
  readonly label: ReactNode
  readonly htmlFor: string
  /** Show a required marker (decorative: the control already says `aria-required`). */
  readonly required: boolean
  /** The control (a widget). */
  readonly children: ReactNode
  /** Help text; render it with `id={helpId}`. */
  readonly help?: ReactNode
  readonly helpId?: string
  /** Error text; render it with `id={errorId}`. */
  readonly error?: ReactNode
  readonly errorId?: string
  /** The form field name, for a `data-` hook. */
  readonly name?: string
}

/** Props of the `Card` skin: a surface for a group of content. */
export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Optional heading node placed at the top. */
  readonly heading?: ReactNode
}

/** Status tones. */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

/** Props of the `Badge` skin. Tone is never conveyed by colour alone: the text says it. */
export interface BadgeProps {
  readonly tone: Tone
  readonly children: ReactNode
}

/** Props of the `Alert` skin: a message block. Spread the rest (role, tabIndex, ref) onto it. */
export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone: 'info' | 'success' | 'warning' | 'danger'
  readonly ref?: Ref<HTMLDivElement>
}

/** Props of the `Table` skin: a scroll box around a `<table>`. */
export interface TableProps {
  /** Spread on the scroll box (it carries the ref, `role="region"`, label and `tabIndex`). */
  readonly regionProps: HTMLAttributes<HTMLDivElement> & { readonly ref?: Ref<HTMLDivElement> }
  /** Spread on the `<table>`. */
  readonly tableProps: TableHTMLAttributes<HTMLTableElement>
  readonly density: Density
  /** `<caption>`, `<thead>` and `<tbody>`, ready to place inside the `<table>`. */
  readonly children: ReactNode
}

/** Props of the `Dialog` skin: a modal over a scrim. Focus and Escape are handled for you. */
export interface DialogProps {
  /** Spread on the scrim element. */
  readonly overlayProps: HTMLAttributes<HTMLDivElement>
  /** Spread on the panel (role, `aria-modal`, labels, ref, key handling). */
  readonly panelProps: HTMLAttributes<HTMLDivElement> & { readonly ref?: Ref<HTMLDivElement> }
  readonly title: ReactNode
  /** Put this id on the title element. */
  readonly titleId: string
  readonly description?: ReactNode
  /** Put this id on the description element, when there is one. */
  readonly descriptionId?: string
  readonly children?: ReactNode
  /** Buttons; primary last. */
  readonly footer?: ReactNode
  readonly size?: 'sm' | 'md' | 'lg'
}

/** Props of the `Popover` skin: a floating panel (menus, the column picker). */
export interface PopoverProps {
  readonly panelProps: HTMLAttributes<HTMLDivElement> & { readonly ref?: Ref<HTMLDivElement> }
  readonly children: ReactNode
}

/** Props of the `Toast` skin: one notification inside the live region the behaviour owns. */
export interface ToastProps {
  readonly tone: 'info' | 'success' | 'danger'
  readonly children: ReactNode
  /** An action button such as Undo, or `null`. */
  readonly action: ReactNode
  /** The dismiss button. */
  readonly dismiss: ReactNode
}

/** Props of the `Chip` skin: an active filter with its remove button. */
export interface ChipProps {
  readonly children: ReactNode
  /** The remove button (already labelled). */
  readonly remove: ReactNode
}

/** Props of the `Skeleton` skin: a loading placeholder (decorative; the region says `aria-busy`). */
export interface SkeletonProps {
  readonly lines: number
}

/** Props of the `Icon` skin: draw the named icon (Tabler names), `aria-hidden`, or nothing. */
export interface IconProps {
  readonly name: string
  readonly size?: 'sm' | 'md'
}

/** Props of every illustration: decorative pictures for empty and error states. */
export interface IllustrationProps {
  readonly className?: string
}

// ─── Slot sets ───────────────────────────────────────────────────────────────────────────────────

/** The shell slots. */
export interface ShellSlots {
  readonly Shell: ComponentType<ShellProps>
  readonly Sidebar: ComponentType<SidebarProps>
  readonly TopBar: ComponentType<TopBarProps>
  readonly AuthLayout: ComponentType<AuthLayoutProps>
  readonly PageHeader: ComponentType<PageHeaderProps>
}

/** The component skins. */
export interface SkinSlots {
  readonly Button: ComponentType<ButtonProps>
  readonly Input: ComponentType<InputProps>
  readonly Textarea: ComponentType<TextareaProps>
  readonly Select: ComponentType<SelectProps>
  readonly Checkbox: ComponentType<CheckboxProps>
  readonly Field: ComponentType<FieldProps>
  readonly Card: ComponentType<CardProps>
  readonly Badge: ComponentType<BadgeProps>
  readonly Alert: ComponentType<AlertProps>
  readonly Table: ComponentType<TableProps>
  readonly Dialog: ComponentType<DialogProps>
  readonly Popover: ComponentType<PopoverProps>
  readonly Toast: ComponentType<ToastProps>
  readonly Chip: ComponentType<ChipProps>
  readonly Skeleton: ComponentType<SkeletonProps>
  readonly Icon: ComponentType<IconProps>
}

/** The illustrations (empty and error states). */
export interface IllustrationSlots {
  readonly Empty: ComponentType<IllustrationProps>
  readonly NotFound: ComponentType<IllustrationProps>
  readonly Forbidden: ComponentType<IllustrationProps>
  readonly Error: ComponentType<IllustrationProps>
}

/** Every shell slot name, for runtime checks. */
export const SHELL_SLOTS: readonly (keyof ShellSlots)[] = Object.freeze([
  'Shell',
  'Sidebar',
  'TopBar',
  'AuthLayout',
  'PageHeader',
])

/** Every skin slot name, for runtime checks. */
export const SKIN_SLOTS: readonly (keyof SkinSlots)[] = Object.freeze([
  'Button',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Field',
  'Card',
  'Badge',
  'Alert',
  'Table',
  'Dialog',
  'Popover',
  'Toast',
  'Chip',
  'Skeleton',
  'Icon',
])

/** Every illustration slot name, for runtime checks. */
export const ILLUSTRATION_SLOTS: readonly (keyof IllustrationSlots)[] = Object.freeze([
  'Empty',
  'NotFound',
  'Forbidden',
  'Error',
])
