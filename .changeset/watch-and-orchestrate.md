---
"ariadnev": minor
---

Add `av watch` and `av orchestrate`.

`watch` polls repositories you have allow-listed for issues addressed to it and answers
them. Issue text is treated as hostile input throughout: a claim is taken before dispatch
so two watchers cannot both answer, fences in the body are neutralised, and the prompt is
framed with a per-invocation nonce. It posts only when a posting capability was supplied.

`orchestrate run|status|stop` runs a job graph, executing independent waves concurrently.
Each job runs in its own process group, so stopping a run reaches the whole tree rather
than orphaning children.
