---
"@strutvane/ui": minor
---

One API setting, three URLs (demo acceptance UI-1, AUTH-1, UI-2). `<StrutvaneApp apiUrl="/api/v1">` now calls auth at `{apiUrl}/auth/*` and loads the resource manifest from the API's origin (`/.well-known/strutvane.json`, never under the API base), through the new `resolveEndpoints()` (core). New props `authUrl` and `manifestUrl` move one of them without touching the others; `tenancy={false}` stops the `{auth}/tenants` request in apps without teams. A relative `apiUrl` (`api/v1`) is read from the site root, so deep links never prefix the API with the page path. `createSessionClient` takes `authUrl`; `fetchManifest` takes the full `url` (or `baseUrl` as before). Docs use `/api/v1`, the URL contract of hub docs/05.
