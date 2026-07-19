---
"vcskill": patch
---

`vcskill --version` now reports the real package version instead of a
hardcoded string; tarball verification additionally asserts all 5 hooks and
the vendored ignore lib are bundled.
