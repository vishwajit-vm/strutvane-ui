---
"@strutvane/ui": patch
---

Sign-out only shows the sign-in screen once the server confirmed it (or answered 401 because the session was already gone). A failed sign-out (offline, 5xx) now keeps the user signed in with the message "Could not sign out. You are still signed in; please try again." instead of hiding a still-valid session behind the sign-in screen. New catalog key: `ui.app.signOutFailed`.
