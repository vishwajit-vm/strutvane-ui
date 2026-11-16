---
"@strutvane/ui": patch
---

`<ResourceForm>` sends one submission at a time. A second submit while the first request was in flight (Enter pressed twice, a fast double click, a script) used to send another create or update; since the API does not deduplicate the `Idempotency-Key`, a double create made two records. Further submits are ignored until the first one settles; after an error the form can be submitted again.
