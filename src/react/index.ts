/**
 * `@strutvane/ui/react`: the React renderer (ADR-0014).
 *
 * `<StrutvaneApp>` is the whole admin; `<StrutvaneProvider>` supplies the API, manifest, registry
 * and locale; `<ResourceList>`, `<ResourceForm>` and `<ResourceDetail>` render any resource from its
 * descriptor; `<FieldShell>` wires label, help and error accessibility once for every widget.
 * Everything is drawn through the design in effect (`@strutvane/ui/design`): this entry has no look
 * of its own. Override any widget or cell through the provider's `overrides` (L1/L2), with no fork.
 *
 * @module
 */

export {
  CommandPalette,
  type CommandPaletteProps,
  MAX_SEARCHED_RESOURCES,
  type PaletteAction,
} from './CommandPalette.tsx'
export {
  ArrayCell,
  BooleanCell,
  DateCell,
  DateTimeCell,
  DecimalCell,
  DefaultCell,
  defaultCells,
  JsonCell,
  NumberCell,
  RelationCell,
} from './cells.tsx'
export {
  createContextValue,
  StrutvaneContext,
  type StrutvaneContextValue,
  useResource,
  useStrutvane,
} from './context.ts'
export { ModalDialog, type ModalDialogProps } from './Dialog.tsx'
export { defaultRegistry } from './defaults.ts'
export { useActiveDesign, useIllustrations, useShellSlots, useSkins } from './design-hooks.ts'
export { errorMessages, FieldShell, type FieldShellProps } from './FieldShell.tsx'
export { describeFilter, FilterBar, type FilterBarProps, rawFilterValues } from './FilterBar.tsx'
export { BackButton, type Crumb, PageHeading, type PageHeadingProps } from './PageHeading.tsx'
export { RenderBoundary, type RenderBoundaryProps } from './RenderBoundary.tsx'
export { detailFields, ResourceDetail, type ResourceDetailProps } from './ResourceDetail.tsx'
export {
  emptyValue,
  type FormField,
  formFields,
  keepIdempotencyKey,
  orderedFieldNames,
  ResourceForm,
  type ResourceFormProps,
} from './ResourceForm.tsx'
export {
  listFields,
  ResourceList,
  type ResourceListProps,
  ROW_HEIGHT,
  TOTAL_CAP,
  virtualWindow,
} from './ResourceList.tsx'
export {
  type RelationOption,
  type RelationOptionsResult,
  recordTitle,
  relationId,
  useDebouncedValue,
  useRelationLabel,
  useRelationOptions,
} from './relations.ts'
export {
  Link,
  type LinkProps,
  matchPath,
  type NavigationBlocker,
  type RouteDefinition,
  Router,
  type RouterState,
  useNavigationBlocker,
  useOptionalRouter,
  useRouter,
} from './router.tsx'
export {
  SignIn,
  SignInDialog,
  type SignInDialogProps,
  SignInForm,
  type SignInFormProps,
  type SignInProps,
} from './SignIn.tsx'
export { StrutvaneApp, type StrutvaneAppProps } from './StrutvaneApp.tsx'
export { StrutvaneProvider, type StrutvaneProviderProps } from './StrutvaneProvider.tsx'
export { type ShortcutHandlers, ShortcutsHelp, useGlobalShortcuts } from './shortcuts.tsx'
export { type ToastApi, type ToastInput, ToastProvider, useToasts } from './toasts.tsx'
export type { Cell, CellProps, UiOverrides, UiRegistry, Widget, WidgetProps } from './types.ts'
export { type DeleteRecordFlow, useDeleteRecord } from './useDeleteRecord.tsx'
export { type UseListQueryOptions, type UseListQueryResult, useListQuery } from './useListQuery.ts'
export {
  CheckboxWidget,
  DateTimeWidget,
  DateWidget,
  defaultWidgets,
  fromLocalInput,
  JsonWidget,
  NumberWidget,
  numericText,
  parseTypedNumber,
  ReadOnlyWidget,
  RelationPickerWidget,
  SelectWidget,
  TextareaWidget,
  TextWidget,
  toLocalInput,
} from './widgets.tsx'
