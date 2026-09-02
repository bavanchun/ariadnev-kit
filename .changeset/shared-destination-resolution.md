---
"ariadnev": patch
---

Providers that share `.agents/skills` no longer overwrite each other, and a
provider that can install nothing says so before the run instead of after it.

The previous fix made the *receipt* honest about a shared path; the write itself
was still decided by execution order. codex, cursor and omp adapt the same
SKILL.md three ways, so 46 files in a real four-provider install held whichever
adaptation ran last — in practice omp's, the only one of the three with no tool
rewrites and no compatibility footer, replacing codex's verified ones. A shared
path is now written once, as a neutral adaptation with canonical tool names, a
neutral `.agents` layout, and one footer naming every provider that reads the
file and what each has to translate. The bytes are a function of the artifact
and the sharing providers, not of the order the user happened to tick the boxes
in. Files a provider does not share (`.codex/agents/*.toml`,
`.codex/commands/*.md`) keep their full provider adaptation.

The same overlap was also destroying files. cursor and omp both install an agent
as a skill-shaped directory in that root, but only cursor's plan appended the
filename inside it, so omp wrote a *file* exactly where cursor had just created
a *directory* — and an atomic write clears a directory standing in a file's
place. Installing both deleted every one of cursor's 16 agent files. The
resolver now returns the file for both, and the installer refuses any write
whose path another provider fills with a directory rather than deleting it.

`dsh` has no verified target, so it installs nothing. That is the evidence
ladder working, but the only way to learn it was to read `written=0 skipped=156`
at the end of a long run. The picker now labels such a provider and asks for
confirmation, and the summary states the outcome in words.
