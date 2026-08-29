---
"ariadnev": minor
---

Add `av run <kit>/<skill>` to dispatch a skill to a coding agent.

Resolves the skill, adapts it for the target runtime, and hands it over. `av run` with a
bare name still routes to the workflow harness for one release and warns; a `<kit>/<skill>`
argument is always dispatch and is refused rather than misrouted.
