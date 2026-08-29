# 0018. `watch` treats issue text as hostile, and says which defences are real

Date: 2026-08-29
Status: Accepted.

## Context

`av watch` monitors a GitHub repository for new issues and answers them by
dispatching a skill through `av run`. Written out, that is:

> Text written by anyone on the public internet is fed to a coding agent with
> shell access on the maintainer's machine, and the result is posted publicly
> under the maintainer's account.

This is the highest-risk code in the parity plan, and it is the last thing built
in it, deliberately — so the decision to enable it is made with everything else
already working, and so that skipping it costs nothing that has already shipped.

This ADR is written **before** the implementation. Written afterwards it would be
a description of what the code happens to do; written first it is a constraint
the code has to satisfy, and the difference shows up in review.

## The threat model

**Input:** an issue title and body. Attacker-controlled, unauthenticated, from
anyone with a GitHub account, on a repository whose issues are open to the world.

**Capability reached:** a dispatched skill running under a coding agent that can
read files and run shell commands, in the maintainer's checkout, with whatever
credentials that environment has.

**Output:** a public comment posted as the maintainer.

**Attacker goal, in rough order of value:** run a command; read a secret and
exfiltrate it through the comment body; get the agent to modify the working tree;
or simply burn the maintainer's model budget.

## Decision

**Issue text is data, never instruction — and the defences that enforce that are
separated from the ones that merely discourage it.**

The separation is the point of this ADR. Every defence below reduces risk. Only
some of them hold *regardless of what the model decides*, and calling an advisory
defence "structural" is exactly where a reviewer stops looking.

### Structural — these hold whatever the model does

1. **Allowlist, never discovery.** A repository is watched because a human named
   it in a command. There is no org-wide watching, no following of links found in
   an issue, and no way for issue content to add a repository to the set.

2. **`dry-run` is the default posture, and posting is a second opt-in.**
   Starting a watch is not consent to post. `start` without `--yes` previews.
   This is the single most valuable mitigation here, because it converts the
   worst outcome — an autonomous public reply loop — into a thing the maintainer
   reads before it happens.

3. **A local rate limit, enforced before dispatch.** Not GitHub's, ours, checked
   in this process before any agent is spawned. A limit enforced only by the
   remote API is not a limit on what runs on this machine.

4. **One daemon per repository, by pidfile.** Two daemons watching one repository
   each hold their own view of the answered set and clobber each other's writes,
   so both answer the same issue. A crash test that exercises one process passes
   while this fails.

5. **The answered-ID set is written before responding, never after.** A crash
   between the two therefore loses a response rather than duplicating one. The
   failure mode is chosen rather than discovered.

### Advisory — helps, but is the mechanism being attacked

6. **Issue text is framed as untrusted content.** It is passed inside a delimited
   block that the dispatched skill is told to treat as data. This is an
   instruction to a model *about* text, which is the same channel the attacker is
   using; it lowers the odds and does not close the hole. It is listed apart from
   the five above for exactly that reason.

   The delimiter is **a per-invocation random nonce**, not a constant. With a
   fixed marker, an issue body containing that marker closes the untrusted block
   and lands its remainder in instruction position — and a fixture set full of
   "ignore previous instructions" bodies would pass green while that case failed
   silently. The three fixtures that matter are: an explicit instruction-override
   body, **a body carrying the literal delimiter**, and **a body carrying a
   plausible guessed nonce**. The first passes trivially. The other two find
   bugs.

## What this does not cover

Stated plainly, because a maintainer enabling this deserves the unhedged version:

**Enabling auto-response on a public repository means a stranger can influence
what runs on your machine.** The five structural mitigations bound the blast
radius — a bounded number of invocations, on a repository you named, previewed
before anything is posted. They do not make the agent immune to a persuasive
issue body. Nothing available today does.

Specifically out of scope here:

- **Sandboxing the dispatched agent.** ariadnev does not control what the coding
  agent may execute; that is the agent's own permission model, and duplicating it
  badly would be worse than not claiming it.
- **Detecting injection by inspecting the text.** A classifier over issue bodies
  would be a sixth advisory defence wearing a structural costume.
- **Secret redaction in the posted comment.** The comment is the agent's output;
  ariadnev bounds its length and does not attempt to prove it carries no secret.

## Consequences

`watch` is off unless someone turns it on, per repository, and previews unless
someone opts into posting. That is deliberately more friction than upstream's,
and the friction is the feature.

The whole phase remains optional. Nothing else in the plan depends on it, and
cutting it would leave parity short by one command in the divergence table — a
better outcome than shipping a rushed autonomous agent that answers strangers.
