/**
 * `@strutvane/ui/core`: the framework-free half of the renderer (ADR-0014).
 *
 * Manifest loading and validation, the list-query state and its URL form, the one filter builder,
 * client validation, issue routing, problem handling, the message formatter, the widget/cell
 * registry, the HTTP and session clients (with the CSRF header), the sidebar model, the shortcut rule
 * and list preferences. Nothing here imports React, so another renderer can reuse it.
 *
 * @module
 */
export {
  type BuildResult,
  buildFilter,
  coerceFilterValue,
  FIELD_NAME_PATTERN,
  type FilterRejection,
  type FilterValue,
  filtersToQueryFilter,
  filterToRawValues,
  isFilterOperator,
  isTextOperator,
  type SimpleFilter,
  simpleFilterToQueryFilter,
} from './filter-builder.ts'
export { createHttpClient, type HttpClientOptions, isRetryableRead } from './http-client.ts'
export { createIdempotencyKey } from './ids.ts'
export {
  candidateFieldNames,
  fieldDomId,
  firstInvalidField,
  issuePathToFieldName,
  type RoutedIssues,
  routeIssues,
  uniqueMessages,
} from './issues.ts'
export {
  listQueryToSearchString,
  type ParsedSearch,
  parseSearchString,
  type RejectedParam,
  toSearchString,
  type UrlRejection,
} from './list-query-url.ts'
export {
  clampPage,
  clampPageSize,
  initialListState,
  type ListAction,
  type ListState,
  listReducer,
  MAX_PAGE,
  PAGE_SIZES,
  pageSizeChoices,
  pageWindow,
  toListQuery,
} from './list-state.ts'
export {
  type FetchManifestOptions,
  fetchManifest,
  ManifestError,
  type ManifestParseResult,
  parseManifest,
} from './manifest-client.ts'
export {
  defaultMessages,
  formatMessage,
  formatTemplate,
  isValidTemplate,
  type MessageCatalog,
  type MessageParams,
} from './messages.ts'
export {
  DEFAULT_RESOURCE_ICON,
  groupSidebar,
  isCurrentPath,
  type SidebarEntry,
  type SidebarGroup,
  type SidebarOptions,
  sidebarEntries,
} from './navigation.ts'
export {
  ApiProblemError,
  catalogKey,
  fieldToPath,
  INTERNAL_ERROR_CODE,
  isApiProblemError,
  isProblem,
  NETWORK_ERROR_CODE,
  networkProblem,
  pathToField,
  problemBannerText,
  problemFromResponse,
  problemIssues,
  sanitizeProblem,
  syntheticProblem,
} from './problems.ts'
export { createRecordBatcher, type RecordBatcher } from './record-batcher.ts'
export {
  type ComponentMap,
  fieldKey,
  mergeRegistry,
  type Registry,
  RegistryError,
  type RegistryOverrides,
  resolveCell,
  resolveWidget,
} from './registry.ts'
export {
  extrasOf,
  maxPerPage,
  recordKey,
  type UiResourceDescriptor,
  type UiResourceExtensions,
  withUiExtensions,
} from './resource-extensions.ts'
export {
  createSessionClient,
  type SessionActor,
  type SessionClient,
  type SessionClientOptions,
  type SessionTenant,
} from './session-client.ts'
export {
  createSequenceMatcher,
  documentHasModal,
  isPaletteChord,
  isTypingTarget,
  type SequenceMatcher,
  type ShortcutEventLike,
  shortcutBlocked,
} from './shortcuts.ts'
export type { ApiRecord, MutationOptions, ResourceApi } from './types.ts'
export {
  INTEGER_TYPES,
  InvalidJsonText,
  isEmptyValue,
  isIsoDate,
  itemFieldDescriptor,
  itemProperties,
  NUMERIC_TYPES,
  TEMPORAL_TYPES,
  validateArrayItems,
  validateField,
} from './validation.ts'
export {
  browserStorage,
  DEFAULT_VIEW_PREFS,
  type Density,
  loadViewPrefs,
  type PrefsStorage,
  parseViewPrefs,
  saveViewPrefs,
  type ViewPrefs,
} from './view-prefs.ts'
export {
  isUnsafeMethod,
  readCookie,
  XSRF_COOKIE,
  XSRF_HEADER,
  type XsrfOptions,
  xsrfHeaders,
} from './xsrf.ts'
