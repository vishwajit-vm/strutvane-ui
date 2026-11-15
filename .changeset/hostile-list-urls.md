---
"@strutvane/ui": patch
---

List URLs: a `search` value the server refuses (over 200 UTF-16 code units, or containing NUL) is now dropped and reported like any other bad parameter instead of being sent and failing the whole list with a 422, and the search box is limited to 200 characters. A page opened by link (a `page[cursor]` in the URL, no history) can now go back to page 1 with "Previous page" instead of being stuck.
