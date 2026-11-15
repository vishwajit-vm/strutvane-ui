---
"@strutvane/ui": patch
---

`DecimalCell` (decimal and money values) shows at least two fraction digits and never fewer than the value has. A `decimal(12,4)` value such as `"1.2345"` was displayed as `1.23`, hiding the stored value and making different values look identical.
