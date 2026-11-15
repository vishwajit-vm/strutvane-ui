---
"@strutvane/ui": patch
---

Accessibility: `<StrutvaneApp>` moves focus to the main area when the page changes (menu link, Open, Edit, Save, Back/Forward), so keyboard and screen-reader users land on the new content instead of on a link or button that may no longer exist. The first load and list query changes (filters, sort, paging) do not move focus.
