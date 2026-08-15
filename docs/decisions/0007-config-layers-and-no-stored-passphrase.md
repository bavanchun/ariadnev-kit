# 0007 — Config layers are a permission boundary, and no secret is stored in them

- Status: accepted
- Date: 2026-08-15

## Context

`env-scope.ts` already states the rule this repository lives by: ariadnev's own
configuration is owned by the user's shell, never by a project file. It enforces
it bluntly — any `ARIADNEV_*` key merely *named* in a cwd dotenv file is stripped
from `process.env`, even if the user also exported it, because the control fails
toward stripping.

A config file schema is where that rule is easiest to lose. The obvious design is
a three-layer cascade, `project > user > default`, over one flat schema. Applied
to this schema it would mean a cloned repository could ship
`.ariadnev/config.json` with `privacyBlock: false` and silently disable the hook
that blocks reads of `.env` files and keys — or point notification destinations
at a host of its choosing, turning a session into an exfiltration channel.

The source schema this port draws from also carries `trust.passphrase`: a
plaintext secret in a file, next to a command whose job is to print the resolved
configuration.

## Decision

**Two layers with different rights, separated structurally.**

- *Project-overridable*: `paths.*`, `plan.*`, `locale.*`, `docs.maxLoc`,
  `project.*`, `statusline.*` — keys that describe a workspace.
- *User-only*: `privacyBlock`, `trust.enabled`, `assertions`,
  `scripts.executionPolicy`, and every notification destination — keys that exist
  to protect the user.

The layer is part of the type. A field is declared through `projectField.*` or
`userField.*`; a bare literal is not a `SchemaNode` and does not compile. Adding
a field without deciding who may set it is impossible, not merely discouraged.

Enforcement is structural too, and doubled:

1. `filterProjectLayer` removes user-only and unknown keys before resolution ever
   sees them, and reports each one with its key and its file.
2. `resolveConfig` reads a user-only key from the user layer only — so a caller
   that forgets to filter still cannot hand a project file those keys.

A merge-then-check design was rejected: it works until someone adds a key and
forgets the check, and the failure is silent.

**No secret in the config file.** `trust.passphrase` is not ported. Keeping
`trust.enabled` preserves the feature that had a consumer; the passphrase had
none here, and a stored plaintext secret that a resolve command can echo is a
leak with extra steps. If real trust ever needs one: a salted hash, a 0600 file,
and the whole `trust` branch dropped from printed output.

**Destinations are validated where they are read, not where they are sent.** A
notification destination must be an https URL whose host is `discord.com`,
`slack.com`, or `api.telegram.org` (exact host or a subdomain — a lookalike like
`hooks.slack.com.evil.test` fails). A rejected value never reaches a sender, and
the warning never quotes the URL back, because warnings end up in logs.

## Consequences

`config prefs resolve` prints a set destination as `<redacted>` and an unset one
as `null`. The distinction is deliberate: "not configured" and "configured but
hidden" must not look alike, or a user cannot tell whether their webhook took
effect.

The JSON Schema at `schemas/av-config.schema.json` is generated from the
TypeScript definition (`pnpm --filter @ariadnev/cli generate:config-schema`) and
a test compares the checked-in file against the generator. It is an editor aid,
not a second authority — host allowlisting stays in `checkValue` so there is one
rule rather than a regex and a function that can disagree.

`scripts.executionPolicy` has two tiers, `allow` (default) and `never`, not the
three a prompt tier would suggest. `ariadnev skill run` has no interactive
surface, and a policy that silently fails to prompt is worse than no policy. The
default preserves today's behavior; the setting exists so a stricter stance is
available, and taking it is a deliberate act.

`watch.*` and `content.*` from the source schema are not ported — they configure
the Tier-3 commands this port excludes. A field arrives when a hook or command
reads it, not because the source had it.

## Revisiting

Adding a key means choosing its layer at the type level; there is no default to
fall into. Moving a key from user-only to project-overridable is a security
decision and belongs in a new ADR, not in a schema edit.
