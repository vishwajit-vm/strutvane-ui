---
"@strutvane/ui": minor
---

Speak the `@strutvane/framework` 0.2 error model (hub RFC-0003; CONSISTENCY #123, #69, #128). The peer and dev dependency on `@strutvane/framework` is now `^0.2.0-next.0`.

- **Every error code is lowercase `snake_case`.** Bodiless responses get the framework's codes (`unauthenticated`, `forbidden`, `not_found`, `conflict`, `csrf_token_mismatch`, `validation_failed`, `rate_limited`, `service_unavailable`, `internal_error`), and `NETWORK_ERROR_CODE` is now `'network_error'`. New export `INTERNAL_ERROR_CODE` (`'internal_error'`). If you compare `problem.code` with an old uppercase name, use the lowercase one (the framework's rename table is `LEGACY_ERROR_CODES` in `@strutvane/framework/core`).
- **Catalogue overrides use the lowercase code**: `ui.problem.code.not_found`, not `ui.problem.code.NOT_FOUND`. An app's own uppercase code, which the framework still accepts until 0.3, also finds a lowercase key.
- **Every validation issue carries `field`**, the dotted path (`'lines.2.amount'`), as the framework 0.2 requires. Parsed issues still place their message by `path` first and `field` second (decision #118), and `field` is rebuilt from the winning `path`, so the two never disagree. Client-side validation issues and the reference API in `@strutvane/ui/testing` carry it too. New export `pathToField()`.
- A test scans `src/` and fails on any uppercase error-code literal.
