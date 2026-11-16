---
"@strutvane/ui": patch
---

`<ResourceList>` (and `useListQuery`) follow URL changes made outside the list. The URL was read only at mount, so clicking the menu entry of the list you were on, or Back/Forward between two states of the same list, changed the address bar while the list kept its old filters, sort and search. A new `initialSearch` that differs from the state the list reported now resets the list (search box included); the URL the list reported itself changes nothing. `useListQuery` returns a new `generation` counter that increases on each such reset.
