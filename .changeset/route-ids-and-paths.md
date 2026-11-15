---
"@strutvane/ui": patch
---

App-shell routing fixes. Record ids are decoded from the URL once, so an id with spaces, slashes or non-ASCII characters reaches the API encoded once instead of twice (`a%2520b`, a 404); a malformed encoding shows "not found". Resource paths from the manifest are stored without surrounding slashes, so a path such as `/partners` can no longer turn a menu link into a protocol-relative link to another site (`//partners`), and multi-segment paths (`admin/accounts`) are routed instead of showing "not found".
