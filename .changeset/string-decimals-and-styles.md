---
"@strutvane/ui": patch
---

Decimal and big-integer values exchanged as strings (`"1250.50"`, schema `type: "string"`) are shown by the number cells instead of an empty dash, and the number widget sends them back as exact text instead of a JavaScript number the API refuses. The default app styles use zero-specificity `:where()` selectors, so app CSS overrides them without workarounds.
