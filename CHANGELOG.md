# @strutvane/ui

## 0.1.0-next.0

### Minor Changes

- First implementation of the renderer core (Phase 1, ADR-0014):
  
  - `@strutvane/ui/core` (framework-free): manifest client with defensive validation, the ADR-0011 list-query URL format (repeated keys) and its `POST /query` fallback, the one filter builder, the list-state reducer with a cursor stack, client validation from the manifest, issue routing (deepest field → parent → banner), problem handling that never crashes on malformed responses, a small safe ICU-style message formatter, typed widget/cell registries, a batched record loader for relation labels, and a `fetch` client with idempotency keys.
  - `@strutvane/ui/react`: `<StrutvaneProvider>`, `<ResourceList>` (TanStack Table v9, server-side sort/filter/search/cursor pagination, URL deep links, virtualization above 100 rows with a fail-safe window, capability-gated New/Edit/Delete), `<ResourceForm>` (TanStack Form, widgets per field type, a searchable paginated belongsTo picker, client + server validation incl. array paths, focus management, idempotent retries), `<FieldShell>`, `<FilterBar>` and L1/L2 overrides through the provider.
