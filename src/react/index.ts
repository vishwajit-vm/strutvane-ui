/**
 * `@strutvane/ui/react`: the React renderer (ADR-0014).
 *
 * `<StrutvaneProvider>` supplies the API, manifest, registry and locale; `<ResourceList>` and
 * `<ResourceForm>` render any resource from its descriptor; `<FieldShell>` wires label, help and
 * error accessibility once for every widget. Override any widget or cell through the provider's
 * `overrides` (L1/L2), with no fork.
 *
 * @module
 */

export { APP_STYLES } from './app-styles.ts'
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
export { defaultRegistry } from './defaults.ts'
export { errorMessages, FieldShell, type FieldShellProps } from './FieldShell.tsx'
export { describeFilter, FilterBar, type FilterBarProps, rawFilterValues } from './FilterBar.tsx'
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
  type RouteDefinition,
  Router,
  type RouterState,
  useRouter,
} from './router.tsx'
export { SignIn, type SignInProps } from './SignIn.tsx'
export { StrutvaneApp, type StrutvaneAppProps } from './StrutvaneApp.tsx'
export { StrutvaneProvider, type StrutvaneProviderProps } from './StrutvaneProvider.tsx'
export type { Cell, CellProps, UiOverrides, UiRegistry, Widget, WidgetProps } from './types.ts'
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
