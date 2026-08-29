---
"ariadnev": minor
---

Add `av analytics` and `av data` over a derived, deletable index.

`analytics status|rebuild` reports and refreshes an index computed entirely from data
ariadnev already has. `data` inspects and clears it. Nothing here is a source of truth:
delete the index and the next rebuild reproduces it, so it can be removed at any time
without losing anything.
