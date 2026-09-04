// Per-provider verification table. Consumed by the resolvers: any cell that is
// not verified => the installer SKIPS and logs, never guesses a path.
//
// Every claim here is re-derived from observation, not inherited. The previous
// table cited two reference generators (`scripts/codex_generator*.py`,
// `scripts/generate-opencode.py`) that do not exist in this repository, so no
// cell could be checked against its stated source. Those citations are gone.
//
// What counts as evidence is deliberately narrow, because the failure mode is
// self-certification — "installed it, seems fine" is not an observation:
//
//   observed    The provider was run and was seen to load the artifact: it
//               listed it by name, or the content appeared in the prompt the
//               provider builds. Records the provider version and the date.
//   convention  No provider-specific observation, but the path is the neutral
//               cross-tool layout (`.agents/`, `AGENTS.md`) that WAS observed
//               working in another provider. Weaker, and labelled as such.
//   none        No evidence. The cell is false and the installer skips it.
//
// The `omp`/`grok`/`dsh` rows are justified in full by
// `plans/reports/observation-260828-grok-omp.md`, which records what was tried
// for each and why it stopped where it did. A cell not justified there cannot
// be `verified: true`.

export type ProviderId =
  | "claude-code"
  | "codex"
  | "cursor"
  | "antigravity"
  | "opencode"
  | "omp"
  | "grok"
  | "dsh"
  | "generic"
  | "test-provider";

export type ArtifactKind =
  | "skill"
  | "agent"
  | "command"
  | "rules"
  | "scripts"
  | "env"
  | "hook"
  | "outputStyle"
  | "statusline";

export type EvidenceLevel = "observed" | "convention" | "none";

export interface CellEvidence {
  verified: boolean;
  level: EvidenceLevel;
  /** How it was checked, or why it could not be. */
  note: string;
}

export interface ProviderVerification {
  paths: Record<ArtifactKind, CellEvidence>;
  toolNames: CellEvidence;
  /** Provider build the observations were made against, or why there is none. */
  observedVersion: string | null;
  /** ISO date of the observation run. */
  observedOn: string | null;
}

function observed(note: string): CellEvidence {
  return { verified: true, level: "observed", note };
}
/**
 * The path is right, and nobody watched it load.
 *
 * Two grounds reach this rung. Either the path is the neutral cross-tool layout
 * that was observed working elsewhere, or the provider's own shipped artefact —
 * its config file, its binary — names the path itself. Both say the same thing
 * operationally, which is why they share a rung: the destination is the
 * provider's, and no load of it was witnessed.
 *
 * What stays excluded is a directory populated by this tool's own lineage. A
 * path this project wrote to certifies nothing about what reads it, and a
 * directory listing cannot tell the two apart — see the `omp` row's comment
 * below, where both the written-to path and the canonical one exist on disk and
 * only the provider's own docs distinguish them.
 */
function convention(note: string): CellEvidence {
  return { verified: true, level: "convention", note };
}
function none(note: string): CellEvidence {
  return { verified: false, level: "none", note };
}

export const SPEC_VERIFIED: Record<ProviderId, ProviderVerification> = {
  "claude-code": {
    observedVersion: "2.1.232",
    // One date per row, never a shared constant: a re-observation of one
    // provider must not re-date a row nobody looked at that day.
    observedOn: "2026-08-15",
    paths: {
      skill: observed("installed skills are listed by name in the running session's available-skills surface"),
      agent: observed("installed agents are listed by name as available subagent types"),
      command: observed("installed commands appear as invocable slash commands"),
      rules: observed("the AGENTS.md managed block is present in the session context"),
      scripts: convention("same .claude tree as the observed kinds; no separate surface reports script discovery"),
      env: convention("template file only — nothing reports reading it"),
      hook: observed("hooks fire and their output appears in session transcripts"),
      outputStyle: none("`.claude/output-styles/` is observed on disk but nothing was seen to load from it"),
      statusline: observed("the settings.json `statusLine` key runs a command and its output is the bar shown in the session; observed working on this machine with a user-configured one"),
    },
    toolNames: observed("canonical format — identity rewrite, nothing to translate"),
  },
  codex: {
    observedVersion: "codex-cli 0.147.0",
    observedOn: "2026-08-15",
    paths: {
      // `codex debug prompt-input` renders the model-visible prompt, so these
      // are not inferences about what codex might read — they are what it sent.
      skill: observed("`codex debug prompt-input` lists 25 installed skills by name, with the install dir as a skill root"),
      agent: observed("`codex debug prompt-input` names all 13 agents installed as .codex/agents/*.toml (checked with codex installed alone, so no other provider's files could account for them)"),
      command: none("`.codex/commands/term-config.md` is written but never appears in prompt-input; commands may only surface on invocation, which was not observable"),
      rules: observed("the AGENTS.md managed block text appears in prompt-input"),
      scripts: convention("shares the .agents tree whose skill root was observed; script execution itself was not observed"),
      env: convention("template file only — nothing reports reading it"),
      hook: convention("codex-cli 0.153.1: `~/.codex/hooks.json` is codex's own hook registry, and its `config.toml` carries a `[hooks.state]` table keying a trust decision and a `trusted_hash` per `<source>:<event>:<group>:<hook>` — so codex was seen parsing that file and recording what it found. The loads behind those entries are *other tools'* hooks (two installed tools plus three plugin-bundled `hooks/hooks.json`), never ariadnev's: trusting a hook is an interactive TUI step, so no hook of ours was watched firing. That is why this is `convention` and not `observed`"),
      outputStyle: none("no equivalent concept observed in this provider's surfaces"),
      statusline: none("no statusline surface observed; nothing in prompt-input or the config reports one"),
    },
    toolNames: none("no observation of which tool names codex accepts; the previous claim cited a generator that is not in this repo"),
  },
  cursor: {
    // The CLI is installed but exposes no local listing or prompt-dump
    // surface. The only probe left would send a prompt to Cursor's API, which
    // spends the user's credits — not something to do for a table refresh.
    observedVersion: "cursor-agent 2026.07.23-e383d2b (no inspection surface)",
    observedOn: null,
    paths: {
      skill: convention(".agents/skills is the same root codex was observed reading; not observed for cursor itself"),
      agent: convention("installed as skill-like dirs under the same .agents/skills root"),
      command: none(".cursor/commands is cursor-specific and was not observed"),
      rules: none(".cursor/rules/*.mdc is cursor-specific and was not observed"),
      scripts: convention("same .agents tree as the skill root above"),
      env: convention("template file only — nothing reports reading it"),
      hook: none("no hook mechanism observed; hooks are a Claude Code event contract and nothing equivalent surfaced"),
      outputStyle: none("no equivalent concept observed in this provider's surfaces"),
      statusline: none("no statusline surface observed for cursor"),
    },
    toolNames: none("no verified equivalents — identity rewrite plus a capability footer"),
  },
  antigravity: {
    observedVersion: "1.1.25",
    // Dates the agent listing and nothing else. Every other cell in this row is
    // `convention` and was not observed that day — the row-level date says when
    // the one observation happened, not that the row was re-checked.
    observedOn: "2026-09-04",
    paths: {
      skill: convention("~/.gemini/config/skills is the root the upstream kit's dedicated emitter targets — its own text says it writes there and that workspace .agents/skills is NOT emitted — and ~/.gemini/config/ exists on disk as a real config tree (agents/, skills/, hooks.json, mcp_config.json, plugins/, sidecars/). Still `convention`: no antigravity surface was observed *reading* it"),
      agent: observed("`agy agent` on 1.1.25 enumerated by name two kit agents produced by the real antigravity adapt pipeline, planted at ~/.gemini/config/agents/<name>.md and removed after. The listing is agy's own frontmatter parser and not a directory echo: an empty control directory lists nothing, and those same two files are dropped silently when `tools:` is a scalar or any `model:` key is present — which is why the adapter emits a tools sequence and no model key. What is still unobserved is a session using the agent, which needs a paid turn. Agent files left at this path by an older build carry the old frontmatter and will not list until they are reinstalled"),
      command: none("no observation, and no neutral convention for commands"),
      rules: convention("AGENTS.md is the cross-tool convention observed working in codex"),
      scripts: convention("same .agents tree as the skill root above"),
      env: convention("template file only — nothing reports reading it"),
      hook: convention("the provider's own shipped doc, ~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/hooks.md, specifies hooks.json: five events, PreToolUse/PostToolUse wrapped in matcher groups and PreInvocation/PostInvocation/Stop flat. The binary carries the same contract (`pre-tool hook %s not registered`, and `prompt hooks are not currently supported` for the event it does not have). ~/.gemini/config/hooks.json exists on this machine holding all five events for a third party's hook, so the global root is a place something other than this project already registers into. Not `observed`: a hook proves itself by firing, and agy only dispatches one inside a session, which is a paid turn"),
      outputStyle: none("no equivalent concept observed in this provider's surfaces"),
      statusline: none("a surface exists and its shape is still unknown: agy has a `/statusline <command>` slash command, a `statusLine` JSON key and a store method that writes it, but nothing says which file that key lands in — ~/.gemini/config/config.json here carries only userSettings.remoteControlHostname, because nothing has ever set one. Finding out means running the TUI and setting a statusline on the user's machine, so this stays a lead"),
    },
    // The "no CLI" premise these cells rested on was wrong: the upstream binary
    // documents an `agy` command with `--sandbox --model <id> --agent <name>`.
    // That makes the surface probeable in principle — but every probe runs a
    // model, so the cells stay unverified rather than guessed.
      toolNames: none("the binary yields tool names by static string extraction, which is a hypothesis about a vocabulary and not an observation of one — see the table in adapt/tool-rewrites.ts. Confirming it means running `agy -p`, which spends the user's model credits and needs their consent, so the rewrite table stays identity"),
  },
  opencode: {
    observedVersion: "1.15.3",
    observedOn: "2026-08-15",
    paths: {
      skill: observed("`opencode debug skill` lists 26 skills whose reported location is the .opencode/skills dir written by the installer"),
      agent: observed("`opencode agent list` names all 13 installed agents as subagents; `opencode debug config` shows the same 13"),
      command: observed("`opencode debug config` shows the installed command in its resolved command set"),
      rules: none("`opencode debug config` reports no instructions; no surface showed the rules content being loaded"),
      scripts: convention("written beside the observed skill and command dirs; execution itself was not observed"),
      env: convention("template file only — nothing reports reading it"),
      hook: none("no hook mechanism observed; hooks are a Claude Code event contract and nothing equivalent surfaced"),
      outputStyle: none("no equivalent concept observed in this provider's surfaces"),
      statusline: none("no statusline surface observed in `opencode debug config`"),
    },
    toolNames: none("no observation of which tool names opencode accepts"),
  },
  omp: {
    // A BINARY IS PRESENT AND THE CELLS ARE STILL `convention`. That is not an
    // oversight, it is the ladder working. `omp read skill://<name>` looked like
    // a local load check; a probe skill planted in both candidate layouts was
    // rejected with "Available: none" while `omp config` confirmed discovery was
    // enabled — so that subcommand resolves a per-session registry, not the
    // discovery pipeline, and proves nothing either way. The only remaining
    // probe is `omp --print`, which spends the user's model credits, and a cell
    // is not worth someone's money to certify.
    //
    // THE PATH IS NOT `~/.omp/agent/skills`, WHICH IS WHERE THE UPSTREAM CLI
    // WROTE. Per omp's own runtime docs, read out of the installed binary
    // (`omp read omp://skills.md`): `~/.omp/agent` is `PI_CODING_AGENT_DIR`,
    // the session-storage directory; the only skills path beneath it is
    // `managed-skills`, the auto-learn bucket at priority 5 that always defers
    // to an authored skill. The canonical native location is `.agent[s]/skills`.
    // Both directories exist and are populated on the observation machine, so a
    // directory listing would have "confirmed" either one — which is exactly the
    // confusion this ladder exists to catch.
    observedVersion: "omp/18.0.4 (no local load-check surface)",
    observedOn: null,
    paths: {
      skill: convention(".agents/skills is the canonical native location per omp's own skills.md, and the same root codex was observed reading; the layout is non-recursive with a required description"),
      agent: convention("installed as skill-like dirs under the same .agents/skills root, as for cursor"),
      command: none("no command surface documented or observed for omp"),
      rules: convention("AGENTS.md is the cross-tool convention observed working in codex"),
      scripts: convention("same .agents tree as the skill root above; execution itself was not observed"),
      env: convention("template file only — nothing reports reading it"),
      hook: none("omp documents its own hook surface, but nothing was observed firing"),
      outputStyle: none("no equivalent concept observed in this provider's surfaces"),
      statusline: none("no statusline surface observed for omp"),
    },
    toolNames: none("no observation of which tool names omp accepts"),
  },
  grok: {
    // Files in a known-good layout, and no binary to run. `~/.grok/` holds
    // {agents,hooks,rules,skills} in a Claude-shaped tree with real skills in
    // it, but seeing them on disk proves only that something wrote there.
    // Without a binary nothing can be watched loading, so `convention` is the
    // ceiling and the honest level.
    observedVersion: null,
    observedOn: null,
    paths: {
      skill: convention("~/.grok/skills matches the Claude-shaped layout observed working in claude-code; no grok binary on PATH to observe a load"),
      agent: convention("~/.grok/agents is populated in the same Claude-shaped tree; not observed loading"),
      command: none("no ~/.grok/commands directory exists and no command surface was observed"),
      rules: convention("~/.grok/rules is present in the same tree; AGENTS.md is the cross-tool convention"),
      scripts: convention("same ~/.grok tree as the skill root above"),
      env: convention("template file only — nothing reports reading it"),
      // `~/.grok/hooks` is populated in the Claude-shaped tree, so the instinct
      // is to verify this cell. The reason it stays `none` is the same one every
      // other grok cell gives: a populated directory proves something wrote
      // there, not that grok reads it, and hooks are an event contract — a
      // layout that looks right but fires nothing is a guard that silently
      // stops guarding. Seeing a load needs a binary that is not on this machine.
      hook: none("~/.grok/hooks exists in the Claude-shaped tree, but no grok binary on PATH to observe a hook load; a populated directory is not an event contract"),
      outputStyle: none("no output-style directory present in the observed tree"),
      statusline: none("no statusline surface observed for grok"),
    },
    toolNames: none("no observation — no grok binary on PATH"),
  },
  dsh: {
    // NOTHING AT ALL. No binary on PATH, no `~/.dsh`, and absent even from the
    // upstream CLI's own adapters directory. Every cell is `none`, the installer
    // skips and logs, and the README says skipped.
    //
    // This is the correct outcome rather than a failure to try: a guessed path
    // would put the installer to work writing into a location nobody has
    // confirmed exists, which is worse than a documented gap because it looks
    // like success.
    observedVersion: null,
    observedOn: null,
    paths: {
      skill: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      agent: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      command: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      rules: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      scripts: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      env: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      hook: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      outputStyle: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
      statusline: none("no dsh binary, no ~/.dsh, and no adapter to read a layout from"),
    },
    toolNames: none("no dsh binary to observe"),
  },
  generic: {
    // Not a product, so "observed" is not a category that can apply. Every
    // true cell here is convention by definition, and says so.
    observedVersion: null,
    observedOn: null,
    paths: {
      skill: convention("neutral .agents/skills layout — the same root codex was observed reading"),
      agent: none("no neutral target for agents — .agents/ defines no agent location"),
      command: none("no neutral target for commands — .agents/ defines no command location"),
      rules: convention("AGENTS.md is the cross-tool convention observed working in codex"),
      scripts: convention("neutral .agents tree beside the skill root; no consumer observed executing from it"),
      env: convention("template file only — no consumer observed reading it"),
      hook: none("no neutral hook mechanism — hooks are a Claude Code event contract"),
      outputStyle: none("no neutral equivalent for output styles in the .agents layout"),
      statusline: none("a statusline is a provider UI affordance; the neutral .agents layout defines none"),
    },
    toolNames: none("no tool-name mapping for a non-product target — identity rewrite only"),
  },
  "test-provider": {
    // Internal mock, filtered out of the public provider list. Excluded from
    // the evidence requirement on purpose: it exists to exercise the installer.
    observedVersion: null,
    observedOn: null,
    paths: {
      skill: convention("mock provider for onboarding-guide validation"),
      agent: none("agents path intentionally unverified, so the skip path stays covered"),
      command: convention("mock"),
      rules: convention("mock"),
      scripts: convention("mock"),
      env: convention("mock"),
      hook: none("mock has no hook support"),
      outputStyle: none("mock has no output-style support"),
      statusline: none("mock has no statusline support"),
    },
    toolNames: none("mock"),
  },
};

/** Providers that must carry real evidence; the internal mock is excluded. */
export const EVIDENCE_REQUIRED_PROVIDERS: ProviderId[] = (Object.keys(SPEC_VERIFIED) as ProviderId[]).filter(
  (p) => p !== "test-provider",
);

export function isVerified(provider: ProviderId, artifact: ArtifactKind): boolean {
  return SPEC_VERIFIED[provider].paths[artifact].verified;
}

export function evidenceFor(provider: ProviderId, artifact: ArtifactKind): CellEvidence {
  return SPEC_VERIFIED[provider].paths[artifact];
}

export function toolNamesVerified(provider: ProviderId): boolean {
  return SPEC_VERIFIED[provider].toolNames.verified;
}
