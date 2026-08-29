---
"ariadnev": minor
---

Correct claims in the shipped kit that did not match the code.

Three fresh reads over the skill and agent content found invocations documented against
flags that never existed (`av journal create --summary --stdin`, `--date`, `--project`),
wrong output paths, a screenshot flag corrected in one reference while its sibling kept
it, and an adapter behaviour described that the adapter does not implement.

Also corrected: four skills queried the wrong resolver for the journal opt-out preference,
and four agents were instructed to write reports or delegate without the capability to do
either — `code-reviewer` most visibly, since scout-based edge-case detection is named in
its own description. Those agents now carry the tools their instructions require.
