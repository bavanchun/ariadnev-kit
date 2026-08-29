---
"ariadnev": patch
---

Uninstalling one provider no longer deletes files another provider still uses.

`codex` and `cursor` both install into `~/.agents/skills`, so a receipt records
the same paths under both. Removing either took the other from healthy to
degraded with every shared file missing. The plan now preserves any path another
install in the same receipt still claims, and names the owner in the report.
