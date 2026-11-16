---
"@strutvane/ui": patch
---

A workspace switch the server refuses or that fails (403, offline, 5xx) now shows "Could not switch the workspace. Please try again." in the header instead of failing silently with an unhandled promise rejection, and the automatic selection of a user's only workspace is attempted once per workspace. New catalog key: `ui.app.switchFailed`.
