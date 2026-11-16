---
"@strutvane/ui": patch
---

Filter values now follow the server's rules exactly, so a filter the UI accepts is the filter the server applies. Decimal, money and big-integer values stay exact text (`9007199254740993` was sent as `9007199254740992`, `12345678901234567.89` was rounded, `1e21` was sent as `1e+21` and refused); datetime values must be ISO-8601 with an offset (zone-less text such as `Nov 14 2026` was sent and refused); text values are limited to 200 UTF-16 code units, as the server counts them. Applies to the filter bar and to filters read from the URL.
