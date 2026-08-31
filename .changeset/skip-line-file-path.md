---
"ariadnev": patch
---

`av install` now names the file each skip is about. An artifact is not a file —
a skill is a directory of SKILL.md, references/ and scripts/ — so five edited
files inside one skill printed five identical `skip skill/journal` lines with no
way to tell which file was meant. The path is appended in brackets; a skip that
concerns no particular file (an unverified provider cell) still prints without
one.
