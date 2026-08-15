# 0009 — Adapter artifacts are a projection, never a second record

- Status: accepted
- Date: 2026-08-15

## Context

The upstream kit writes five files to track what it owns in a provider tree:
`install-manifest.json`, `native-skill-paths.json`, `native-skill-hashes.json`,
`native-hook-expectations.json`, and `<provider>-ownership.json`. Porting them
keeps the format readable by tools built around it.

It also recreates a defect this repository already ruled out. `install-receipt.ts`
is the ownership record: `audit` classifies files against it, `uninstall` removes
what it lists and preserves what has changed since. A second record of the same
facts, written and read independently, drifts — and then `audit` and `uninstall`
disagree about what is installed, with no arbiter.

## Decision

Generate the five from the receipt, and let nothing read them back.

- The generator's signature is `Receipt → Record<filename, content>`. No
  filesystem is in reach of it, so there is no path by which one of these files
  becomes an input.
- Hashes are copied from `ReceiptFile.sha256`, never recomputed. Recomputing
  would be a second opinion about the same bytes, which is how two records begin
  to differ even when both are written correctly.
- A test walks `install/`, `uninstall/`, `doctor/`, `kit/`, and `providers/`
  looking for an import of the generator. The one-way rule is a gate, not a
  convention.

`ariadnev adapters regenerate` rebuilds them. Because the generator is
deterministic, what it writes is byte-identical to what the install wrote — so
the answer to any discrepancy is "regenerate", never "reconcile". Editing one by
hand and regenerating overwrites the edit and reports that it did.

Writing them is best-effort. An install that put every file in place is not a
failed install because a projection of it could not be written.

## Consequences

The artifacts are for other tools. Nothing in ariadnev consults them, so a user
who deletes the whole `~/.ariadnev/adapters/` tree loses nothing but
compatibility with those tools, recoverable with one command.

The plan that led here pre-decided prefix-compressing the ownership file above
500K. Measured on a full-kit install it is 504K — over by a rounding error, and
every compression scheme changes the field layout these files exist to match.
Trading format compatibility for 200K on a local file written once per install
defeats their only purpose, so the size bound now sits where trouble would
actually be: unbounded growth, tested at 2MB across all five.

## Revisiting

If a future feature wants one of these as an input, that is the moment to stop
and ask what the receipt is missing — and to extend the receipt. The failure this
decision prevents is not "reading a file"; it is having two answers to "what did
we install".
