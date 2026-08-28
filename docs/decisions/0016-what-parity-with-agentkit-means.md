# 0016. What parity with AgentKit means

Date: 2026-08-28
Status: Accepted

## Context

The maintainer's instruction for plan `260828-0859-ak-2-14-parity` is that
ariadnev must be *"tối thiểu y chang"* AgentKit 2.14.0 — at minimum, identical —
excluding auth, remote telemetry, and licensing.

Taken literally that instruction is unimplementable, and the reason is worth
stating rather than working around: **the exclusion set is not closed under
dependency.** Four AgentKit commands outside the three excluded domains rest on
plumbing inside them.

| Command | What it depends on |
|---|---|
| `api`'s LLM proxy | `login` credentials and licensed routing |
| `feedback send` | AgentKit's own feedback registry |
| `gui` | AgentKit's hosted desktop-app download |
| `changelog` | AgentKit's release endpoints |

Without a definition, each of the thirteen phases would re-litigate this, and
would reach a slightly different answer. Worse, two failure modes are available
and both look like progress: shipping a command that exists and returns "not
implemented", which converts a known gap into a support ticket; or shipping a
credential-handling daemon that has no possible client.

There is a second reason a definition is needed. `~/.local/bin/ak` is a closed
Mach-O binary with no source on this machine. Parity cannot be established by
diffing code. It can only be established against observable behavior.

## Decision

**Parity means: every AgentKit 2.14.0 command exists in ariadnev with
local-first semantics. Where a command's remote-vendor half cannot exist here, it
maps to an ariadnev-owned equivalent, and the substitution is recorded in the
divergence table below rather than silently made.**

Three corollaries:

1. **Behavioral, not textual.** Bit-level output matching is not the goal.
   Every phase opens by capturing the real command's `--help` and a sample
   `--json` envelope as its contract, and writes tests against that capture. A
   parity claim asserted from a help string nobody ran is not evidence.
2. **No stubs.** A command that is in scope ships working behavior or does not
   ship. Enforced by a `NotImplementedError` assertion in CI, active from the
   first phase, so the missing-count ratchet cannot be improved by registering
   empty commands.
3. **The excluded set is frozen.** It is committed as data and asserted by test,
   so a later phase cannot improve the parity number by reclassifying a command
   instead of implementing it.

### The divergence table

| Name | Disposition | Reason |
|---|---|---|
| `login`, `logout`, `whoami`, `licenses` | excluded | auth and licensing, excluded by the maintainer |
| `api` — LLM proxy half | excluded by dependency | serves licensed routing via `login` credentials; porting it ships a credential daemon with no client. The local half (health, status, version, dashboard) is in scope |
| `gui` | ariadnev-owned equivalent | AgentKit's is a native desktop app it builds and hosts. ariadnev starts the local API and opens `ariadnev-web`, a dashboard that already exists. Cloning the native app means a second product and a webview dependency swamp inside a Bun binary, against a download endpoint ariadnev does not operate |
| `feedback` | ariadnev-owned equivalent | remote telemetry is excluded; export-only, or an issue on ariadnev's own repository |
| `changelog` | ariadnev-owned equivalent | reads ariadnev's own signed releases, not AgentKit's endpoints |
| `run` | renamed collision | `av run` was the workflow harness. `run` becomes skill dispatch to match AgentKit; the harness becomes `av workflow`, behind a one-release deprecation shim |
| `agentkit`, `ak` skills | merged, not imported | they are routers over *AgentKit's* CLI and catalog. ariadnev ships native `ariadnev` and `av` equivalents; importing verbatim would ship prose describing a CLI that does not exist |

Two further rows are expected and are filled in by the phases that resolve them:
whether `dsh` ships as a verified provider or a documented skipped one, and
whether `orchestrate` matches AgentKit's Darwin-only restriction.

One divergence hides inside a covered command and is recorded here so it is not
missed: if `dsh` ships unverified, then `av run --target dsh` refuses where
`ak run --target dsh` works. `run` counts as registered and an audit over command
names would pass, so this is a divergence row in its own right, not a footnote.

## Consequences

"Parity" becomes auditable. The audit walks the captured surface and asserts, for
every name, that it is either registered or present in this table with a reason.
Neither half can be satisfied by prose.

Every ariadnev-owned equivalent is a place where ariadnev is deliberately not
AgentKit. Shipping the local half and stating plainly that the remote half is
unavailable is the honest pattern — and it is upstream's own: `ak versions
--help` says live version comparison is *"disabled until the AgentKit versions
registry endpoint is deployed"*.

## Revisiting

If auth or licensing ever come into scope, the excluded-by-dependency rows are
the first things to revisit, and `api`'s proxy is the one that changes most.
Adding a row to the divergence table is an ordinary decision; removing the table,
or letting a name sit in neither the table nor the registered set, is not.
