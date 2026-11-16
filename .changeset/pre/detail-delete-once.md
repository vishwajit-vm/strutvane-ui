---
"@strutvane/ui": patch
---

`<ResourceDetail>` deletes once per user action. A second click while the confirmation or the request was pending sent another `DELETE` (and showed "no longer exists" for a record that was just deleted), and every attempt used a new idempotency key. The Delete button is now disabled while a delete is pending, and the key is reused until the delete succeeds, like the list's Delete.
