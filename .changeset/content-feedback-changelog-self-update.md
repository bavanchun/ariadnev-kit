---
"ariadnev": minor
---

Add `av content`, `av feedback`, `av changelog` and `av self-update`.

`content publish|queue|schedule` posts to configured channels over https only. `feedback`
exports a report by default and submits only when asked. `changelog` reads ariadnev's own
signed releases. `self-update` is an alias over the existing signed update path — the same
checksum verification, not a second one.
