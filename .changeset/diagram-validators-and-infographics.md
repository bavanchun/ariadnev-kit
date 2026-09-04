---
"ariadnev": minor
---

`av:diagram` gains the geometry and motion validators it was missing, vendored
byte-verbatim from the pinned upstream commit along with the template system's
own runner. `av skill verify diagram` now reports the environment those
validators need instead of answering `unknown` for want of a lock.

The vendoring script that produced them was fixed first: it did not pin the
source checkout, it overwrote the provenance it was supposed to record, and its
stamps came from the wall clock, so two runs at the same upstream commit
disagreed. Stamps now derive from that commit's own committer date, which makes
the output a pure function of the commit and the target set — a second run at
the same pin reports no change.

`av:preview` gains an AntV G2 reference for poster-shaped infographic pages: a
few oversized stat callouts and one or two statement charts, rather than a
dashboard grid. It is a choice of reference, not a new flag — `--html --explain`
is unchanged, and the routing table now points at it. No executable code was
added to the preview skill.
