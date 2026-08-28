# 0016. What parity with upstream means

Date: 2026-08-28
Status: Accepted

## Context

The maintainer's instruction for plan `260828-0859-ak-2-14-parity` is that
ariadnev must be *"tối thiểu y chang"* the upstream kit at 2.14.0 — at minimum,
identical — excluding auth, remote telemetry, and licensing.

Taken literally that instruction is unimplementable, and the reason is worth
stating rather than working around: **the exclusion set is not closed under
dependency.** Four upstream commands outside the three excluded domains rest on
plumbing inside them.

| Command | What it depends on |
|---|---|
| `api`'s LLM proxy | `login` credentials and licensed routing |
| `feedback send` | upstream's own feedback registry |
| `gui` | upstream's hosted desktop-app download |
| `changelog` | upstream's release endpoints |

Without a definition, each of the thirteen phases would re-litigate this, and
would reach a slightly different answer. Worse, two failure modes are available
and both look like progress: shipping a command that exists and returns "not
implemented", which converts a known gap into a support ticket; or shipping a
credential-handling daemon that has no possible client.

There is a second reason a definition is needed. The upstream binary on this
machine is a closed Mach-O executable with no source anywhere on disk. Parity
cannot be established by diffing code. It can only be established against
observable behavior.

## Decision

**Parity means: every upstream 2.14.0 command exists in ariadnev with local-first
semantics. Where a command's remote-vendor half cannot exist here, it maps to an
ariadnev-owned equivalent, and the substitution is recorded in the divergence
table below rather than silently made.**

Three corollaries:

1. **Behavioral, not textual.** Bit-level output matching is not the goal.
   Every phase opens by capturing the real command's `--help` and a sample
   `--json` envelope as its contract, and writes tests against that capture. A
   parity claim asserted from a help string nobody ran is not evidence.
2. **No stubs.** A command that is in scope ships working behavior or does not
   ship. Enforced by a `NotImplementedError` assertion in CI, active from the
   first phase, so the missing-count ratchet cannot be improved by registering
   empty commands.
   The assertion is a drift guard, not the enforcement: it catches a stub that
   uses the sanctioned error type, and `throw new Error("coming soon")` walks
   straight past it. What actually enforces "no stubs" is the capture-first test
   per command.
3. **The excluded set is frozen.** It is committed as data and asserted by test,
   so a later phase cannot improve the parity number by reclassifying a command
   instead of implementing it.

### The divergence table

| Name | Disposition | Reason |
|---|---|---|
| `login`, `logout`, `whoami`, `licenses` | excluded | auth and licensing, excluded by the maintainer |
| `api` — LLM proxy half | excluded by dependency | serves licensed routing via `login` credentials; porting it ships a credential daemon with no client. The local half (health, status, version, dashboard) is in scope |
| `gui` | ariadnev-owned equivalent | upstream's is a native desktop app it builds and hosts. ariadnev starts the local API and opens `ariadnev-web`, a dashboard that already exists. Cloning the native app means a second product and a webview dependency swamp inside a Bun binary, against a download endpoint ariadnev does not operate |
| `feedback` | ariadnev-owned equivalent *(shape unresolved)* | remote telemetry is excluded. Export-only, or an issue on ariadnev's own repository — resolved by the phase that implements it |
| `changelog` | ariadnev-owned equivalent | reads ariadnev's own signed releases, not upstream's endpoints |
| `content` | ariadnev-owned equivalent | publishes to user-supplied webhooks; ariadnev hosts no channel |
| `self-update` | ariadnev-owned equivalent | an alias over ariadnev's own signed update path, not upstream's binary channel |
| `run` | renamed collision | `av run` was the workflow harness. `run` becomes skill dispatch to match upstream; the harness becomes `av workflow`, behind a one-release deprecation shim |
| the two upstream router skills | merged, not imported | they are routers over *upstream's* CLI and catalog. ariadnev ships native `ariadnev` and `av` equivalents; importing verbatim would ship prose describing a CLI that does not exist |

**`parity-manifest.json` is the authoritative machine copy; this table is
exposition.** The audit runs against the manifest, and the two must agree — but
they cannot be literally identical, because the brand-drift gate forbids this
document from naming upstream identifiers the manifest may need. On a mismatch
the manifest wins and this table is corrected.

Two further rows are expected and are filled in by the phases that resolve them:
whether `dsh` ships as a verified provider or a documented skipped one, and
whether `orchestrate` matches upstream's Darwin-only restriction.

One divergence hides inside a covered command and is recorded here so it is not
missed: if `dsh` ships unverified, then `av run --target dsh` refuses where
upstream's equivalent works. `run` counts as registered and an audit over command
names would pass, so this is a divergence row in its own right, not a footnote.

## Consequences

"Parity" becomes auditable. The audit walks the captured surface and asserts, for
every name, that it is either registered or present in this table with a reason.
Neither half can be satisfied by prose.

Every ariadnev-owned equivalent is a place where ariadnev is deliberately not
upstream. Shipping the local half and stating plainly that the remote half is
unavailable is the honest pattern — and it is upstream's own: its `versions
--help` says live version comparison is disabled until a registry endpoint it has
not deployed exists.

**This ADR names an upstream product that the brand-drift gate is built to keep
out of the tree, which is why it names none of its identifiers.** That gate's
requirement is that no upstream identifier survives anywhere; the parity work
does not get an exemption from it, and phase 1 owes a decision on how the parity
tooling and manifest satisfy the gate.

## Revisiting

If auth or licensing ever come into scope, the excluded-by-dependency rows are
the first things to revisit, and `api`'s proxy is the one that changes most.
Adding a row to the divergence table is an ordinary decision; removing the table,
or letting a name sit in neither the table nor the registered set, is not.
