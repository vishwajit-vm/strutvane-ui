---
"@strutvane/ui": patch
---

Relation collections (`hasMany`, `hasOne`, `manyToMany`), which the framework's manifest lists as fields but which have no value on the record, are no longer shown as an always-empty list column or as an empty read-only input in edit forms. The detail page keeps rendering them as related lists. An explicit `ui.listColumns` entry is still honoured.
