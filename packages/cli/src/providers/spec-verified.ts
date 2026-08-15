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

export type ProviderId =
  | "claude-code"
  | "codex"
  | "cursor"
  | "antigravity"
  | "opencode"
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

const OBSERVED_ON = "2026-08-15";

function observed(note: string): CellEvidence {
  return { verified: true, level: "observed", note };
}
function convention(note: string): CellEvidence {
  return { verified: true, level: "convention", note };
}
function none(note: string): CellEvidence {
  return { verified: false, level: "none", note };
}

export const SPEC_VERIFIED: Record<ProviderId, ProviderVerification> = {
  "claude-code": {
    observedVersion: "2.1.232",
    observedOn: OBSERVED_ON,
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
    observedOn: OBSERVED_ON,
    paths: {
      // `codex debug prompt-input` renders the model-visible prompt, so these
      // are not inferences about what codex might read — they are what it sent.
      skill: observed("`codex debug prompt-input` lists 25 installed skills by name, with the install dir as a skill root"),
      agent: observed("`codex debug prompt-input` names all 13 agents installed as .codex/agents/*.toml (checked with codex installed alone, so no other provider's files could account for them)"),
      command: none("`.codex/commands/term-config.md` is written but never appears in prompt-input; commands may only surface on invocation, which was not observable"),
      rules: observed("the AGENTS.md managed block text appears in prompt-input"),
      scripts: convention("shares the .agents tree whose skill root was observed; script execution itself was not observed"),
      env: convention("template file only — nothing reports reading it"),
      hook: none("no hook mechanism observed; hooks are a Claude Code event contract and nothing equivalent surfaced"),
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
    observedVersion: null,
    observedOn: null,
    paths: {
      skill: convention(".agents/skills is the neutral root observed working in codex; the app ships no CLI, so nothing could be observed for antigravity"),
      agent: none("no observation, and no neutral convention for agents"),
      command: none("no observation, and no neutral convention for commands"),
      rules: convention("AGENTS.md is the cross-tool convention observed working in codex"),
      scripts: convention("same .agents tree as the skill root above"),
      env: convention("template file only — nothing reports reading it"),
      hook: none("no hook mechanism observed; hooks are a Claude Code event contract and nothing equivalent surfaced"),
      outputStyle: none("no equivalent concept observed in this provider's surfaces"),
      statusline: none("no CLI to observe with, and no neutral convention for a statusline"),
    },
    toolNames: none("no observation — the app ships no CLI to observe with"),
  },
  opencode: {
    observedVersion: "1.15.3",
    observedOn: OBSERVED_ON,
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
