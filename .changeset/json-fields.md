---
"@strutvane/ui": patch
---

JSON fields (`type: "json"`) get a JSON widget and cell. They were edited in a plain text input, so saving sent the typed text as a JSON string, which the API accepts, silently replacing an object with a string; the detail page showed an empty dash. The new `JsonWidget` parses the text and sends the JSON value, refuses text that does not parse ("Value must be valid JSON.", catalog key `invalid_json`) and keeps the draft while typing; `JsonCell` shows the JSON. New exports: `JsonWidget`, `JsonCell`, and `InvalidJsonText` from `@strutvane/ui/core`.
