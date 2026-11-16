---
"@strutvane/ui": patch
---

A cell or widget that throws while rendering (an app override, an unknown field type, a value of an unexpected shape) no longer blanks the whole screen. Each list cell and detail field shows "Cannot display this value", and each form field shows "This field cannot be displayed. The other fields can still be saved."; everything else keeps working, and a cell retries when its value changes. New export: `RenderBoundary`; new catalog keys `ui.cell.error` and `ui.form.widgetError`.
