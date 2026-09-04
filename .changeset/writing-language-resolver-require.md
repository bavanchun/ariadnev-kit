---
"ariadnev": patch
---

The writing-language resolver runs again instead of throwing on require.

It asked for a config client module that has never existed in this repository,
so every invocation died with `MODULE_NOT_FOUND` before it could read anything.
The ship, review-pr and github skills all instruct the agent to run this
resolver to decide which language a PR body is written in; with it broken, that
step failed and the language fell back to whatever the agent guessed. It now
requires the client that actually exports `resolvePrefs`, and the precedence it
documents — `ARIADNEV_LANGUAGE`, then `CK_RESPONSE_LANGUAGE`, then
`locale.responseLanguage` from config, then English — is covered by tests, so a
rename on either side of that boundary fails the suite rather than the user's
next ship.

Its reference page describes where the setting actually lives again. It still
listed a seven-step chain through `config.yaml` and `.claude/.ck.json`, sources
the resolver stopped reading when the YAML scraper was removed, so anyone
following it configured a file nothing looks at.
