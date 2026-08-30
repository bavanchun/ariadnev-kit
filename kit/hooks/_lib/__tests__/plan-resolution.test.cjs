'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolvePlanPath, extractTaskListId, getReportsPath } = require('../av-config-utils.cjs');

// The pointer source reads `.ariadnev/current-plan.json`, the file `av plan use`
// writes. These cases run in a temp dir that is not a git repository, so the
// branch key is the shared "(no branch)" key the CLI files detached and non-git
// work under — which keeps the cases about the pointer, not about git state.
function sandbox() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'av-planptr-'));
  fs.mkdirSync(path.join(project, '.ariadnev'), { recursive: true });
  return project;
}

function writePointer(project, content) {
  const file = path.join(project, '.ariadnev', 'current-plan.json');
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

function makePlan(project, plansDir, name) {
  const dir = path.join(project, plansDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\ntitle: t\nstatus: pending\n---\n');
  return dir;
}

function context(project) {
  // resolvePlanPath only reads these two fields off the context; a bound
  // session store is deliberately not required for the pointer source.
  return { sessionLaunchRoot: project, canonicalProjectRoot: project };
}

const CONFIG = { paths: { plans: 'plans' }, plan: {} };

test('a pointer written by the CLI resolves as the directive plan', () => {
  const project = sandbox();
  const dir = makePlan(project, 'plans', '260830-1200-demo');
  writePointer(project, { schemaVersion: 1, byBranch: { '(no branch)': '260830-1200-demo' } });

  const resolved = resolvePlanPath(context(project), CONFIG);
  assert.strictEqual(resolved.resolvedBy, 'pointer');
  assert.strictEqual(resolved.path, dir);
});

test('the pointer honors a paths.plans override', () => {
  const project = sandbox();
  const dir = makePlan(project, path.join('work', 'plans'), '260830-1200-demo');
  writePointer(project, { schemaVersion: 1, byBranch: { '(no branch)': '260830-1200-demo' } });

  const resolved = resolvePlanPath(context(project), { paths: { plans: 'work/plans' }, plan: {} });
  assert.strictEqual(resolved.resolvedBy, 'pointer');
  assert.strictEqual(resolved.path, dir);
});

test('a malformed pointer falls through instead of throwing', () => {
  const project = sandbox();
  makePlan(project, 'plans', '260830-1200-demo');
  writePointer(project, '{ not json');

  const resolved = resolvePlanPath(context(project), CONFIG);
  assert.strictEqual(resolved.resolvedBy, null, 'no git and no session state, so nothing else resolves');
  assert.strictEqual(resolved.path, null);
});

test('a missing pointer file falls through', () => {
  const project = sandbox();
  makePlan(project, 'plans', '260830-1200-demo');
  const resolved = resolvePlanPath(context(project), CONFIG);
  assert.strictEqual(resolved.resolvedBy, null);
});

test('a pointer that outlived its plan directory falls through', () => {
  const project = sandbox();
  writePointer(project, { schemaVersion: 1, byBranch: { '(no branch)': 'gone-plan' } });
  const resolved = resolvePlanPath(context(project), CONFIG);
  assert.strictEqual(resolved.resolvedBy, null);
});

test('a pointer from another schema version is refused', () => {
  const project = sandbox();
  makePlan(project, 'plans', '260830-1200-demo');
  writePointer(project, { schemaVersion: 2, byBranch: { '(no branch)': '260830-1200-demo' } });
  assert.strictEqual(resolvePlanPath(context(project), CONFIG).resolvedBy, null);
});

test('a path-shaped plan name cannot steer the pointer out of the plans dir', () => {
  const project = sandbox();
  // The target exists, so only the traversal check stands between the pointer
  // file and a resolution outside the plans root.
  fs.mkdirSync(path.join(project, 'secrets'), { recursive: true });
  writePointer(project, { schemaVersion: 1, byBranch: { '(no branch)': '../secrets' } });
  assert.strictEqual(resolvePlanPath(context(project), CONFIG).resolvedBy, null);
});

test('a null session context still resolves the pointer from the process cwd', () => {
  // Session binding needs the runtime marker; the CLI-owned pointer must not.
  const project = sandbox();
  const dir = makePlan(project, 'plans', '260830-1200-demo');
  writePointer(project, { schemaVersion: 1, byBranch: { '(no branch)': '260830-1200-demo' } });

  const previous = process.cwd();
  process.chdir(project);
  try {
    const resolved = resolvePlanPath(null, CONFIG);
    assert.strictEqual(resolved.resolvedBy, 'pointer');
    assert.strictEqual(resolved.path, fs.realpathSync(dir));
  } finally {
    process.chdir(previous);
  }
});

test('a pointer-resolved plan is a directive for reports and task-list id', () => {
  const project = sandbox();
  const dir = makePlan(project, 'plans', '260830-1200-demo');
  const resolved = { path: dir, resolvedBy: 'pointer' };

  assert.strictEqual(extractTaskListId(resolved), '260830-1200-demo');
  assert.strictEqual(
    getReportsPath(resolved.path, resolved.resolvedBy, { reportsDir: 'reports' }, { plans: 'plans' }),
    `${dir}/reports/`
  );
});
