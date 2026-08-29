---
"ariadnev": minor
---

Add `av content-search` — opt-in, per-project plaintext shards.

Off unless you enable it per project. When on, it builds a local plaintext index so
searches stay on your machine; the shard lives under the project and is deleted with it.
No content leaves the host.
