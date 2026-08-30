---
"ariadnev": minor
---

`av run` now takes a skill reference only. The workflow-harness sense of the
name moved to `av workflow run` in 1.3.0 and shipped a release with a warning
shim so existing scripts kept working; this release removes it, as that warning
said it would. `av run <workflow-id>` is refused with the grammar it expected;
`av run resume|status|cancel` are `av workflow resume|status|cancel`.
