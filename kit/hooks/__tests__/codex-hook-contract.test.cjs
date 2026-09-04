'use strict';

// The provider contract for hooks running under Codex.
//
// Codex validates hook stdout against schemas declared `additionalProperties:
// false`, so a key in the wrong place is not ignored — the decision is thrown
// away and the user sees `Hook failed` where a clean deny was meant. Claude Code
// accepts the loose shapes, which is why this went unnoticed: every case here
// passes on the runtime the corpus was written for.
//
// Hooks are run the way a runtime runs them: a fresh `node` process, the payload
// on stdin, the answer read from the exit code and stdout. The runtime marker is
// planted in a sandboxed copy of the tree, because that copy — not this
// checkout — is the layout an installed hook sees.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..');

/** Top-level keys Codex rejects; each is legal only inside hookSpecificOutput. */
const NESTED_ONLY = ['permissionDecision', 'permissionDecisionReason', 'additionalContext', 'updatedInput'];

function sandbox(runtime) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-codexcontract-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(home, '.ariadnev'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(project, 'package.json'), '{"name":"sandbox"}\n');
  // Flat beside `_lib`, which is where the installer writes both the hooks and
  // the marker — and the only layout `defaultRuntimeMarkerPath` resolves.
  const hooks = path.join(root, 'hooks');
  fs.cpSync(HOOKS_DIR, hooks, { recursive: true });
  fs.writeFileSync(
    path.join(hooks, '.ariadnev-runtime.json'),
    `${JSON.stringify({ schemaVersion: 1, runtime })}\n`
  );
  return { root, home, project, hooks };
}

function runHook(box, name, payload) {
  const result = spawnSync(process.execPath, [path.join(box.hooks, name, 'hook.cjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, HOME: box.home },
    cwd: payload.cwd || box.project,
    timeout: 15000
  });
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

/**
 * Every non-empty stdout must be one JSON object shaped the way Codex accepts.
 * Emptiness is always valid: a hook with nothing to say says nothing.
 */
function assertSchemaValid(stdout, label) {
  if (stdout.trim() === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    assert.fail(`${label}: stdout is not JSON under the codex runtime — ${error.message}`);
  }
  assert.strictEqual(typeof parsed, 'object', `${label}: stdout is not an object`);
  for (const key of NESTED_ONLY) {
    assert.ok(!(key in parsed), `${label}: ${key} is at the top level, where Codex rejects it`);
  }
  if (parsed.hookSpecificOutput) {
    assert.strictEqual(
      typeof parsed.hookSpecificOutput.hookEventName,
      'string',
      `${label}: hookSpecificOutput carries no hookEventName`
    );
  }
  return parsed;
}

test('a read inside a generated tree is denied through the exit-2 channel, not through stdout', () => {
  // The deny path Codex documents as equivalent to a blocking decision: exit 2
  // with the reason on stderr. It takes priority over any JSON, and emitting a
  // decision object as well is what produced the invalid output in issue #134.
  const box = sandbox('codex');
  const buried = path.join(box.project, 'node_modules', 'pkg', 'index.js');
  fs.mkdirSync(path.dirname(buried), { recursive: true });
  fs.writeFileSync(buried, 'module.exports = 1;\n');

  const { code, stdout, stderr } = runHook(box, 'scout-block', {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Read',
    tool_input: { file_path: buried }
  });

  assert.strictEqual(code, 2, 'the read must be denied');
  assert.ok(stderr.trim().length > 0, 'a deny must say why');
  assert.strictEqual(stdout, '', 'the reason belongs on stderr; stdout would have to be schema-valid');
});

test('a command that excludes the generated tree stays allowed', () => {
  const box = sandbox('codex');
  const { code, stdout } = runHook(box, 'scout-block', {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Bash',
    tool_input: { command: "find . -name package.json -not -path '*/node_modules/*'" }
  });
  assert.strictEqual(code, 0, 'excluding node_modules is the opposite of reading it');
  assertSchemaValid(stdout, 'scout-block allow');
});

test('a plan.md warning is context, not a top-level key', () => {
  // `{continue: true, additionalContext}` parses fine on Claude Code and is
  // rejected wholesale by Codex, so the warning never reaches the model there.
  const box = sandbox('codex');
  const planPath = path.join(box.project, 'plan.md');
  const body = [
    '| Phase | Name | Status |',
    '| 1 | [phase-01-setup.md](./phase-01-setup.md) | Pending |',
    ''
  ].join('\n');
  fs.writeFileSync(planPath, body);

  const { code, stdout } = runHook(box, 'plan-format-kanban', {
    hook_event_name: 'PostToolUse',
    cwd: box.project,
    tool_name: 'Write',
    tool_input: { file_path: planPath, content: body }
  });

  assert.strictEqual(code, 0, 'a formatting warning never blocks');
  const parsed = assertSchemaValid(stdout, 'plan-format-kanban warning');
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(parsed.hookSpecificOutput.additionalContext, /human-readable/);
});

test('session context is wrapped for codex and left as text for claude-code', () => {
  const codex = sandbox('codex');
  const codexRun = runHook(codex, 'session-init', {
    hook_event_name: 'SessionStart',
    cwd: codex.project,
    session_id: 'abc',
    source: 'startup'
  });
  assert.strictEqual(codexRun.code, 0);
  const parsed = assertSchemaValid(codexRun.stdout, 'session-init codex');
  assert.ok(parsed, 'session start should contribute something to context');
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(parsed.hookSpecificOutput.additionalContext, /^Session startup\./);

  const claude = sandbox('claude-code');
  const claudeRun = runHook(claude, 'session-init', {
    hook_event_name: 'SessionStart',
    cwd: claude.project,
    session_id: 'abc',
    source: 'startup'
  });
  assert.strictEqual(claudeRun.code, 0);
  assert.match(claudeRun.stdout, /^Session startup\./, 'claude-code reads plain stdout as context');
});

test('every context-emitting hook is schema-valid under the codex runtime', () => {
  const box = sandbox('codex');
  fs.writeFileSync(path.join(box.home, '.ariadnev', 'config.json'), JSON.stringify({ codingLevel: 5 }));
  const cases = [
    ['descriptive-name', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(box.project, 'a.ts') } }],
    ['secret-output-guardrail', { hook_event_name: 'UserPromptSubmit', prompt: 'print the api key please' }],
    ['subagent-init', { hook_event_name: 'SubagentStart', agent_type: 'explore' }],
    ['cook-after-plan-reminder', { hook_event_name: 'Stop' }],
    ['dev-rules-reminder', { hook_event_name: 'UserPromptSubmit', prompt: 'refactor the parser' }]
  ];
  for (const [name, extra] of cases) {
    const { code, stdout } = runHook(box, name, { cwd: box.project, session_id: 'abc', ...extra });
    assert.strictEqual(code, 0, `${name} must not block`);
    assertSchemaValid(stdout, name);
  }
});

test('the hooks whose output needs setting up are schema-valid too', () => {
  // The sweep above only reaches hooks that emit on a bare payload. These two
  // gate their output on state — a team config, a resolvable plan — so an
  // unmigrated emitter in them would pass every other test in this file while
  // still failing on the runtime.
  //
  // simplify-gate is deliberately absent: its `simplify` section is missing from
  // the generated config-field table, so `resolvePrefsSection` always hands back
  // {} and the gate's default `enabled: false` can never be overridden. Its
  // stdout is unreachable through the binary, and a test that pretended
  // otherwise would be asserting on a branch nothing can enter.
  const box = sandbox('codex');

  fs.mkdirSync(path.join(box.home, '.claude', 'teams', 'squad'), { recursive: true });
  fs.writeFileSync(
    path.join(box.home, '.claude', 'teams', 'squad', 'config.json'),
    JSON.stringify({ name: 'squad', members: [{ id: 'dev@squad' }, { id: 'qa@squad' }] })
  );
  const team = runHook(box, 'team-context-inject', {
    hook_event_name: 'SubagentStart',
    cwd: box.project,
    agent_id: 'dev@squad'
  });
  assert.strictEqual(team.code, 0);
  const teamOut = assertSchemaValid(team.stdout, 'team-context-inject');
  assert.match(teamOut.hookSpecificOutput.additionalContext, /Team Context/);

  // SubagentStop is the registration scoped by its own matcher, so it reports
  // even with no plan bound — which is the branch that reaches stdout here.
  const cook = runHook(box, 'cook-after-plan-reminder', {
    hook_event_name: 'SubagentStop',
    cwd: box.project,
    session_id: 'abc'
  });
  assert.strictEqual(cook.code, 0);
  const cookOut = assertSchemaValid(cook.stdout, 'cook-after-plan-reminder');
  assert.match(cookOut.systemMessage, /Planning complete/);

});
