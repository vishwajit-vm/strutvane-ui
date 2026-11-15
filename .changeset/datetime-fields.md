---
"@strutvane/ui": patch
---

Datetime fields (`type: "datetime"` / `"timestamp"`) get a widget and a cell. They fell back to a plain text input showing the raw UTC text (`2026-11-14T08:30:00.000Z`), and a time typed without an offset was refused by the API; cells showed the raw ISO text. `DateTimeWidget` is a native `datetime-local` input in the viewer's time zone that sends an ISO-8601 instant in UTC; `DateTimeCell` formats the instant in the viewer's time zone and keeps the exact value in `<time dateTime>`. New exports: `DateTimeWidget`, `DateTimeCell`, `toLocalInput`, `fromLocalInput`.
