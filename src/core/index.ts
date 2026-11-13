/**
 * `@strutvane/ui/core`: the framework-free half of the renderer (ADR-0014).
 *
 * Manifest loading and validation, the list-query state and its URL form, the one filter builder,
 * client validation, issue routing, problem handling, the message formatter, the widget/cell
 * registry and the HTTP client. Nothing here imports React, so another renderer can reuse it.
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
export { createHttpClient, type HttpClientOptions } from './http-client.ts'
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
  clampPageSize,
  initialListState,
  type ListAction,
  type ListPageState,
  type ListState,
  listReducer,
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
  ApiProblemError,
  isApiProblemError,
  isProblem,
  NETWORK_ERROR_CODE,
  networkProblem,
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
export type { ApiRecord, MutationOptions, ResourceApi } from './types.ts'
export {
  INTEGER_TYPES,
  isEmptyValue,
  isIsoDate,
  itemFieldDescriptor,
  itemProperties,
  NUMERIC_TYPES,
  TEMPORAL_TYPES,
  validateArrayItems,
  validateField,
} from './validation.ts'
