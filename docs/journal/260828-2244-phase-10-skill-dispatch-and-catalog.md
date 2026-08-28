# Phase 10: skill dispatch and catalog

**Date**: 2026-08-28 22:44
**Component**: cli
**Status**: Resolved

## What happened

Closed phase 10 of the ak-2.14.0 parity plan across two PRs (#94 dispatch, #95 catalog). Ratchet 11 -> 8.

Dispatch. `av run <kit>/<skill>` spawns a coding agent and streams it. The slash still discriminates the two senses of `run`, so the deprecated harness spelling keeps working and warning until 1.4.0. The adapter invocation table holds only providers whose non-interactive flag was read off their own --help on this machine (claude, codex, cursor-agent, omp); grok and dsh are absent and are refused rather than guessed, matching how the installer treats an unverified cell.

The process layer was the risk. Children spawn detached so a signal reaches the agent's own children, SIGINT is forwarded explicitly, and the timeout escalates TERM to KILL after a grace. Both teardown paths assert a grandchild is gone, and both were re-verified on the real binary: zero orphans after a trapped-SIGTERM timeout and after a mid-run SIGINT.

Catalog. skills/agents/commands share one implementation over an artifact-kind parameter, so their JSON envelopes cannot drift. Single-artifact install plans a kit containing one artifact and reuses the existing installer rather than adding a second writer.

Three plan corrections, all resolved against the repository rather than the prose. codex-agent-runtime is in the frozen excluded set pinned by a test written to stop exactly this kind of reclassification, so it was not built. skill's five verbs already existed. Dispatch takes the existing four-value exit table instead of upstream's codes 4 and 5.

Two defects that only the compiled binary revealed: installed-state was read from the receipt by name-matching paths, which answered "not installed" for everything because the installed directory is av-scout rather than scout; and remove deleted the files but left the directory, so list kept reporting the skill as installed.
