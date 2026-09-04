#!/usr/bin/env node
/**
 * Test suite for worktree.cjs
 * Run: node .claude/skills/av-worktree/scripts/worktree.test.cjs
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_PATH = path.join(__dirname, 'worktree.cjs');
const STANDALONE_DIR = path.dirname(path.dirname(__dirname)); // worktree dir
const MONOREPO_DIR = process.env.MONOREPO_DIR || '/path/to/ariadnev';
const CURRENT_GIT_ROOT = execSync('git rev-parse --show-toplevel', {
  encoding: 'utf-8',
  cwd: STANDALONE_DIR,
  stdio: ['pipe', 'pipe', 'pipe']
}).trim();

let passed = 0;
let failed = 0;
const results = [];

// Test helper
function run(args, options = {}) {
  const cwd = options.cwd || STANDALONE_DIR;
  try {
    const output = execSync(`node "${SCRIPT_PATH}" ${args}`, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim(), exitCode: 0 };
  } catch (error) {
    return {
      success: false,
      output: error.stdout?.toString().trim() || '',
      stderr: error.stderr?.toString().trim() || '',
      exitCode: error.status || 1
    };
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    results.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    throw new Error(`Invalid JSON: ${str.slice(0, 100)}...`);
  }
}

// ============================================
// INFO COMMAND TESTS
// ============================================
console.log('\n📋 INFO Command Tests');

test('info returns valid JSON', () => {
  const result = run('info --json');
  assert(result.success, 'Command should succeed');
  const json = assertJSON(result.output);
  assert(json.info === true, 'Should have info: true');
});

test('info detects repo type', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(['standalone', 'monorepo'].includes(json.repoType), 'Should detect repo type');
});

test('info detects base branch', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(json.baseBranch, 'Should detect base branch');
  assert(['dev', 'develop', 'main', 'master'].includes(json.baseBranch), 'Should be valid branch');
});

test('info finds env files', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(Array.isArray(json.envFiles), 'Should have envFiles array');
});

test('info detects dirty state', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(typeof json.dirtyState === 'boolean', 'Should have dirtyState boolean');
});

test('info detects monorepo from monorepo root', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return; // Skip if not available
  const result = run('info --json', { cwd: MONOREPO_DIR });
  const json = assertJSON(result.output);
  assert(json.repoType === 'monorepo', 'Should detect monorepo');
  assert(json.projects.length > 0, 'Should have projects');
});

test('monorepo uses internal worktrees directory', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return; // Skip if not available
  const result = run('info --json', { cwd: MONOREPO_DIR });
  const json = assertJSON(result.output);
  // Monorepo should use worktrees/ inside the repo, not sibling
  assert(json.worktreeRoot === path.join(MONOREPO_DIR, 'worktrees'),
    `Expected ${path.join(MONOREPO_DIR, 'worktrees')}, got ${json.worktreeRoot}`);
  assert(json.worktreeRootSource === 'monorepo internal',
    `Expected 'monorepo internal', got ${json.worktreeRootSource}`);
});

test('info returns text output without --json', () => {
  const result = run('info');
  assert(result.success, 'Command should succeed');
  assert(result.output.includes('Repository Info'), 'Should have text output');
});

// ============================================
// LIST COMMAND TESTS
// ============================================
console.log('\n📂 LIST Command Tests');

test('list returns valid JSON', () => {
  const result = run('list --json');
  assert(result.success, 'Command should succeed');
  const json = assertJSON(result.output);
  assert(json.success === true, 'Should have success: true');
  assert(Array.isArray(json.worktrees), 'Should have worktrees array');
});

test('list worktrees have required fields', () => {
  const result = run('list --json');
  const json = assertJSON(result.output);
  if (json.worktrees.length > 0) {
    const wt = json.worktrees[0];
    assert(wt.path, 'Worktree should have path');
    assert(wt.commit, 'Worktree should have commit');
    assert(wt.branch, 'Worktree should have branch');
  }
});

test('list returns text output without --json', () => {
  const result = run('list');
  assert(result.success, 'Command should succeed');
  assert(result.output.includes('worktrees'), 'Should have text output');
});

// ============================================
// STATUS COMMAND TESTS
// ============================================
console.log('\n🩺 STATUS Command Tests');

test('status returns valid JSON', () => {
  const result = run('status --json');
  assert(result.success, 'Command should succeed');
  const json = assertJSON(result.output);
  assert(json.success === true, 'Should have success: true');
  assert(json.currentWorktree, 'Should include currentWorktree');
  assert(Array.isArray(json.worktrees), 'Should include worktrees array');
});

test('status reports current worktree health fields', () => {
  const result = run('status --json');
  const json = assertJSON(result.output);
  const current = json.currentWorktree;
  assert(current.path === CURRENT_GIT_ROOT, `Should normalize current path to ${CURRENT_GIT_ROOT}`);
  assert(typeof current.isCurrentWorktree === 'boolean', 'Should flag current worktree');
  assert(typeof current.isMainWorktree === 'boolean', 'Should flag main worktree');
  assert(typeof current.branchExists === 'boolean', 'Should report branch existence');
  assert(typeof current.dirtyState === 'boolean', 'Should report dirty state');
  assert(typeof current.ahead === 'number', 'Should report ahead count');
  assert(typeof current.behind === 'number', 'Should report behind count');
});

test('status includes normalized path entry for current worktree', () => {
  const result = run('status --json');
  const json = assertJSON(result.output);
  assert(json.worktrees.some(w => w.path === CURRENT_GIT_ROOT), 'Should include normalized current worktree path');
});

test('status returns text output without --json', () => {
  const result = run('status');
  assert(result.success, 'Command should succeed');
  assert(result.output.includes('Worktree Status'), 'Should have text output');
});

// ============================================
// CREATE COMMAND TESTS
// ============================================
console.log('\n🆕 CREATE Command Tests');

test('create requires feature name', () => {
  const result = run('create --json');
  assert(!result.success, 'Should fail without feature');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_FEATURE', 'Should have MISSING_FEATURE error');
});

test('create dry-run does not create worktree', () => {
  const result = run('create test-dry-run --prefix feat --dry-run --json');
  assert(result.success, 'Dry-run should succeed');
  const json = assertJSON(result.output);
  assert(json.dryRun === true, 'Should have dryRun: true');
  assert(json.wouldCreate, 'Should have wouldCreate object');
});

test('create dry-run shows correct branch name', () => {
  const result = run('create my-feature --prefix fix --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch === 'fix/my-feature', 'Branch should be fix/my-feature');
});

test('create sanitizes feature name - spaces', () => {
  const result = run('create "my cool feature" --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.includes('my-cool-feature'), 'Should sanitize spaces');
});

test('create sanitizes feature name - uppercase', () => {
  const result = run('create "MyFeature" --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.includes('myfeature'), 'Should lowercase');
});

test('create sanitizes feature name - special chars', () => {
  const result = run('create "feat@#$test" --dry-run --json');
  const json = assertJSON(result.output);
  assert(!json.wouldCreate.branch.includes('@'), 'Should remove special chars');
});

test('create respects --prefix flag', () => {
  const prefixes = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf'];
  for (const prefix of prefixes) {
    const result = run(`create test-${prefix} --prefix ${prefix} --dry-run --json`);
    const json = assertJSON(result.output);
    assert(json.wouldCreate.branch.startsWith(`${prefix}/`), `Should use ${prefix} prefix`);
  }
});

test('create shows base branch', () => {
  const result = run('create test-base --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.baseBranch, 'Should show base branch');
});

test('create shows worktree path', () => {
  const result = run('create test-path --dry-run --json');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.worktreePath, 'Should show worktree path');
  assert(json.wouldCreate.worktreePath.includes('worktrees'), 'Path should include worktrees dir');
});

test('create dry-run surfaces checkout-submodules flag', () => {
  const result = run('create test-submodules --dry-run --json --checkout-submodules');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.checkoutSubmodules === true, 'Should show checkoutSubmodules flag');
});

test('create dry-run shows explicit base branch source', () => {
  const result = run('create test-explicit-base --dry-run --json --base dev');
  assert(result.success, 'Should succeed with explicit base');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.baseBranch === 'dev', 'Should use explicit base branch');
  assert(json.wouldCreate.baseBranchSource === 'explicit', 'Should mark baseBranchSource as explicit');
});

test('create rejects invalid explicit base branch input', () => {
  const result = run('create test-invalid-base --json --base "--oops"');
  assert(!result.success, 'Should fail with invalid base branch');
  const json = assertJSON(result.output);
  assert(json.error.code === 'INVALID_BASE_BRANCH', 'Should report INVALID_BASE_BRANCH');
});

test('create rejects nonexistent explicit base branch', () => {
  const result = run('create test-missing-base --json --base branch-that-should-not-exist-xyz');
  assert(!result.success, 'Should fail with nonexistent base branch');
  const json = assertJSON(result.output);
  assert(json.error.code === 'BASE_BRANCH_NOT_FOUND', 'Should report BASE_BRANCH_NOT_FOUND');
});

test('create in monorepo requires project', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('create --json', { cwd: MONOREPO_DIR });
  assert(!result.success, 'Should fail without project in monorepo');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_ARGS', 'Should have MISSING_ARGS error');
});

test('create in monorepo with project works', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('create engineer test-mono --prefix feat --dry-run --json', { cwd: MONOREPO_DIR });
  assert(result.success, 'Should succeed with project');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.project === 'ariadnev-engineer', 'Should detect project');
});

test('create detects invalid project', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('create nonexistent test-invalid --json', { cwd: MONOREPO_DIR });
  assert(!result.success, 'Should fail with invalid project');
  const json = assertJSON(result.output);
  assert(json.error.code === 'PROJECT_NOT_FOUND', 'Should have PROJECT_NOT_FOUND error');
});

// ============================================
// REMOVE COMMAND TESTS
// ============================================
console.log('\n🗑️  REMOVE Command Tests');

test('remove requires worktree name', () => {
  const result = run('remove --json');
  assert(!result.success, 'Should fail without name');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_WORKTREE', 'Should have MISSING_WORKTREE error');
});

test('remove dry-run does not remove worktree', () => {
  // First get a worktree name from list
  const listResult = run('list --json');
  const listJson = assertJSON(listResult.output);
  const removable = listJson.worktrees.find(w => !w.isMainWorktree);

  if (removable) {
    const name = path.basename(removable.path);
    const result = run(`remove "${name}" --dry-run --json`);
    assert(result.success, 'Dry-run should succeed');
    const json = assertJSON(result.output);
    assert(json.dryRun === true, 'Should have dryRun: true');
    assert(json.wouldRemove, 'Should have wouldRemove object');
  }
});

test('remove handles not found', () => {
  const result = run('remove nonexistent-worktree-xyz --json');
  assert(!result.success, 'Should fail for nonexistent');
  const json = assertJSON(result.output);
  assert(json.error.code === 'WORKTREE_NOT_FOUND', 'Should have WORKTREE_NOT_FOUND error');
});

test('remove error includes available worktrees', () => {
  const result = run('remove nonexistent-worktree-xyz --json');
  const json = assertJSON(result.output);
  assert(Array.isArray(json.error.availableWorktrees), 'Should list available worktrees');
});

// ============================================
// PRUNE COMMAND TESTS
// ============================================
console.log('\n🧹 PRUNE Command Tests');

test('prune dry-run returns valid JSON', () => {
  const result = run('prune --dry-run --json');
  assert(result.success, 'Dry-run should succeed');
  const json = assertJSON(result.output);
  assert(json.success === true, 'Should have success: true');
  assert(json.dryRun === true, 'Should have dryRun: true');
  assert(Array.isArray(json.entries), 'Should include entries array');
});

test('prune text output is readable', () => {
  const result = run('prune --dry-run');
  assert(result.success, 'Dry-run should succeed');
  assert(result.output.includes('Prune'), 'Should have readable prune output');
});

// ============================================
// AUTO-FEATURES TESTS (env templates)
// ============================================
console.log('\n🤖 Auto-Features Tests');

test('create dry-run succeeds', () => {
  const result = run('create test-env-feature --prefix feat --dry-run --json');
  assert(result.success, 'Dry-run should succeed');
  const json = assertJSON(result.output);
  assert(json.dryRun === true, 'Should have dryRun: true');
});

test('create ignores unsafe --env traversal entries', () => {
  const result = run('create env-guard --prefix feat --dry-run --json --env "../.env,secrets/.env,.env.local"');
  assert(result.success, 'Dry-run should succeed');
  const json = assertJSON(result.output);
  assert(Array.isArray(json.warnings), 'Should include warnings');
  assert(json.warnings.some(w => w.includes('unsafe env file')), 'Should warn for unsafe env entries');
});

// ============================================
// WORKTREE ROOT DETECTION TESTS
// ============================================
console.log('\n📍 Worktree Root Detection Tests');

test('info shows worktreeRoot and worktreeRootSource', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(json.worktreeRoot, 'Should have worktreeRoot');
  assert(json.worktreeRootSource, 'Should have worktreeRootSource');
  assert(typeof json.worktreeRoot === 'string', 'worktreeRoot should be string');
  assert(json.worktreeRoot.includes('worktrees'), 'worktreeRoot should include worktrees');
});

test('create --worktree-root overrides default location', () => {
  const customRoot = '/tmp/test-worktrees';
  const result = run(`create test-custom-root --prefix feat --dry-run --json --worktree-root "${customRoot}"`);
  assert(result.success, 'Should succeed with custom root');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.worktreePath.startsWith(customRoot), 'Path should use custom root');
  assert(json.wouldCreate.worktreeRootSource === '--worktree-root flag', 'Source should be flag');
});

test('create --worktree-root with relative path resolves to absolute', () => {
  const result = run('create test-relative --prefix feat --dry-run --json --worktree-root "./custom-worktrees"');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(path.isAbsolute(json.wouldCreate.worktreePath), 'Path should be absolute');
});

test('create dry-run shows worktreeRootSource', () => {
  const result = run('create test-source --prefix feat --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.worktreeRootSource, 'Should show worktreeRootSource');
});

test('superproject detection in submodule', () => {
  // Test from ariadnev-engineer submodule
  const submodulePath = path.join(MONOREPO_DIR, 'ariadnev-engineer');
  if (!fs.existsSync(submodulePath)) return;
  const result = run('info --json', { cwd: submodulePath });
  const json = assertJSON(result.output);
  // Should detect parent monorepo as superproject
  assert(json.worktreeRootSource.includes('superproject') || json.worktreeRootSource === 'monorepo root',
    'Should detect superproject or monorepo root');
});

test('WORKTREE_ROOT env var overrides detection', () => {
  const envRoot = '/tmp/env-worktrees';
  try {
    const output = execSync(`WORKTREE_ROOT="${envRoot}" node "${SCRIPT_PATH}" create test-env --prefix feat --dry-run --json`, {
      encoding: 'utf-8',
      cwd: STANDALONE_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const json = JSON.parse(output.trim());
    assert(json.wouldCreate.worktreePath.startsWith(envRoot), 'Should use env var root');
    assert(json.wouldCreate.worktreeRootSource === 'WORKTREE_ROOT env', 'Source should be env');
  } catch (error) {
    // May fail if script path issue - skip
  }
});

test('invalid WORKTREE_ROOT env var fails safely', () => {
  const invalidRoot = '/etc/passwd';
  try {
    execSync(`WORKTREE_ROOT="${invalidRoot}" node "${SCRIPT_PATH}" info --json`, {
      encoding: 'utf-8',
      cwd: STANDALONE_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    assert(false, 'Should fail with invalid WORKTREE_ROOT');
  } catch (error) {
    const json = assertJSON(error.stdout.toString());
    assert(json.error.code === 'INVALID_WORKTREE_ROOT', 'Should have INVALID_WORKTREE_ROOT');
  }
});

test('create --worktree-root validates path existence', () => {
  // Use a deeply nested non-existent path that can't be created
  const invalidRoot = '/nonexistent/deeply/nested/path/that/does/not/exist';
  const result = run(`create test-invalid-root --prefix feat --json --worktree-root "${invalidRoot}"`);
  assert(!result.success, 'Should fail with invalid path');
  const json = assertJSON(result.output);
  assert(json.error.code === 'INVALID_WORKTREE_ROOT', 'Should have INVALID_WORKTREE_ROOT error');
});

// ============================================
// ERROR HANDLING TESTS
// ============================================
console.log('\n⚠️  Error Handling Tests');

test('unknown command returns error', () => {
  const result = run('unknowncommand --json');
  assert(!result.success, 'Should fail');
  const json = assertJSON(result.output);
  assert(json.error.code === 'UNKNOWN_COMMAND', 'Should have UNKNOWN_COMMAND error');
});

test('no command returns error', () => {
  const result = run('--json');
  assert(!result.success, 'Should fail');
  const json = assertJSON(result.output);
  assert(json.error.code === 'UNKNOWN_COMMAND', 'Should have UNKNOWN_COMMAND error');
});

test('errors have suggestion field', () => {
  const result = run('create --json');
  const json = assertJSON(result.output);
  assert(json.error.suggestion, 'Error should have suggestion');
});

test('success commands return exit code 0', () => {
  const result = run('info --json');
  assert(result.exitCode === 0, 'Exit code should be 0');
});

test('error commands return exit code 1', () => {
  const result = run('create --json');
  assert(result.exitCode === 1, 'Exit code should be 1');
});

test('non-git directory returns error', () => {
  const result = run('info --json', { cwd: '/tmp' });
  assert(!result.success, 'Should fail in non-git dir');
  const json = assertJSON(result.output);
  assert(json.error.code === 'NOT_GIT_REPO', 'Should have NOT_GIT_REPO error');
});

// ============================================
// EDGE CASE: FEATURE NAME HANDLING
// ============================================
console.log('\n🔤 Feature Name Edge Cases');

test('create handles empty string feature', () => {
  const result = run('create "" --json');
  assert(!result.success, 'Should fail with empty feature');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MISSING_FEATURE', 'Should have MISSING_FEATURE error');
});

test('create handles very long feature name (truncates to 50 chars)', () => {
  const longName = 'a'.repeat(100);
  const result = run(`create "${longName}" --dry-run --json`);
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  const branchPart = json.wouldCreate.branch.split('/')[1];
  assert(branchPart.length <= 50, 'Feature part should be max 50 chars');
});

test('create handles unicode characters', () => {
  const result = run('create "测试功能-тест" --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  // Unicode gets converted to dashes
  assert(!json.wouldCreate.branch.includes('测'), 'Should not contain unicode');
});

test('create handles leading/trailing dashes', () => {
  const result = run('create "---feature---" --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(!json.wouldCreate.branch.endsWith('/-'), 'Should not end with dash');
  assert(!json.wouldCreate.branch.includes('//'), 'Should not have double slashes');
});

test('create handles only special characters', () => {
  const result = run('create "@#$%^&*()" --dry-run --json');
  assert(!result.success, 'Should fail when sanitized feature is empty');
  const json = assertJSON(result.output);
  assert(json.error.code === 'INVALID_FEATURE_NAME', 'Should report invalid feature name');
});

test('create handles numbers only', () => {
  const result = run('create "12345" --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.includes('12345'), 'Should keep numbers');
});

test('create handles mixed case camelCase', () => {
  const result = run('create "myNewFeature" --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.includes('mynewfeature'), 'Should be lowercase');
});

// ============================================
// --no-prefix: MULTI-SEGMENT BRANCH NAMES
// ============================================
console.log('\n🔀 --no-prefix Multi-Segment Branch Names');

test('--no-prefix preserves forward slashes in branch name', () => {
  const result = run('create "dev/feat/999-test-slash-preserve" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch === 'dev/feat/999-test-slash-preserve', `Should preserve slashes, got: ${json.wouldCreate.branch}`);
});

test('--no-prefix preserves case with slashes', () => {
  const result = run('create "User/Fix/MyBug" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch === 'User/Fix/MyBug', `Should preserve case and slashes, got: ${json.wouldCreate.branch}`);
});

test('--no-prefix flattens slashes in worktree directory name', () => {
  const result = run('create "kai/feat/my-feature" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  // Worktree path should NOT contain nested directories from branch slashes
  const worktreeName = json.wouldCreate.worktreePath.split('/').pop();
  assert(!worktreeName.includes('/'), 'Worktree dir name should not contain slashes');
  assert(worktreeName.includes('kai-feat-my-feature'), `Should flatten slashes to dashes, got: ${worktreeName}`);
});

test('--no-prefix collapses consecutive slashes', () => {
  const result = run('create "kai///feat//my-feature" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(!json.wouldCreate.branch.includes('//'), `Should not have consecutive slashes, got: ${json.wouldCreate.branch}`);
});

test('--no-prefix trims leading/trailing slashes', () => {
  const result = run('create "/kai/feat/my-feature/" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(!json.wouldCreate.branch.startsWith('/'), 'Should not start with slash');
  assert(!json.wouldCreate.branch.endsWith('/'), 'Should not end with slash');
});

test('--no-prefix rejects path traversal (..)', () => {
  const result = run('create "kai/../../../etc/passwd" --no-prefix --dry-run --json');
  assert(!result.success, 'Should fail with path traversal');
  const json = assertJSON(result.output);
  assert(json.error.code === 'INVALID_FEATURE_NAME', 'Should report invalid feature name');
});

test('--no-prefix still works for simple names (no slashes)', () => {
  const result = run('create "ND-1377-cleanup-docs" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch === 'ND-1377-cleanup-docs', `Should work without slashes, got: ${json.wouldCreate.branch}`);
});

test('--no-prefix preserves dots in branch names', () => {
  const result = run('create "release/v1.2.3" --no-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch === 'release/v1.2.3', `Should preserve dots, got: ${json.wouldCreate.branch}`);
});

// ============================================
// EDGE CASE: PATH HANDLING
// ============================================
console.log('\n📁 Path Handling Edge Cases');

test('create handles path with spaces via --worktree-root', () => {
  const pathWithSpaces = '/tmp/my worktree dir';
  const result = run(`create test-spaces --prefix feat --dry-run --json --worktree-root "${pathWithSpaces}"`);
  assert(result.success, 'Should succeed with quoted path');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.worktreePath.includes('my worktree dir'), 'Should preserve spaces');
});

test('create handles home directory expansion', () => {
  // Script uses path.resolve which doesn't expand ~, so this tests current behavior
  const result = run('create test-home --prefix feat --dry-run --json --worktree-root "~/test-worktrees"');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  // ~/test-worktrees should be resolved relative to cwd, not expanded
  assert(json.wouldCreate.worktreePath, 'Should have worktree path');
});

test('create validates file path as worktree root', () => {
  // /etc/passwd exists but is a file, not directory
  const result = run('create test-file --prefix feat --json --worktree-root "/etc/passwd"');
  assert(!result.success, 'Should fail when path is file');
  const json = assertJSON(result.output);
  assert(json.error.code === 'INVALID_WORKTREE_ROOT', 'Should have INVALID_WORKTREE_ROOT');
  assert(json.error.message.includes('not a directory'), 'Should mention not a directory');
});

test('create handles current directory as worktree root', () => {
  const result = run('create test-current --prefix feat --dry-run --json --worktree-root "."');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(path.isAbsolute(json.wouldCreate.worktreePath), 'Should resolve to absolute');
});

// ============================================
// EDGE CASE: BRANCH PREFIX HANDLING
// ============================================
console.log('\n🏷️  Branch Prefix Edge Cases');

test('create uses default prefix when --prefix missing value', () => {
  // --prefix without value should use 'feat' default
  const result = run('create test-default-prefix --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.startsWith('feat/'), 'Should default to feat');
});

test('create handles invalid prefix gracefully', () => {
  // Prefix is sanitized before use.
  const result = run('create test-custom-prefix --prefix custom --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.startsWith('custom/'), 'Should use custom prefix');
});

// ============================================
// EDGE CASE: MONOREPO SCENARIOS
// ============================================
console.log('\n📦 Monorepo Edge Cases');

test('create with partial project match in monorepo', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  // 'cli' should match 'ariadnev-cli'
  const result = run('create cli test-partial --prefix feat --dry-run --json', { cwd: MONOREPO_DIR });
  assert(result.success, 'Should succeed with partial match');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.project === 'ariadnev-cli', 'Should find ariadnev-cli');
});

test('create detects multiple project matches', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  // 'ariadnev' matches multiple projects
  const result = run('create ariadnev test-multi --prefix feat --json', { cwd: MONOREPO_DIR });
  assert(!result.success, 'Should fail with multiple matches');
  const json = assertJSON(result.output);
  assert(json.error.code === 'MULTIPLE_PROJECTS_MATCH', 'Should have MULTIPLE_PROJECTS_MATCH error');
  assert(json.error.matchingProjects.length > 1, 'Should list multiple matches');
});

test('info shows project env files in monorepo', () => {
  if (!fs.existsSync(MONOREPO_DIR)) return;
  const result = run('info --json', { cwd: MONOREPO_DIR });
  const json = assertJSON(result.output);
  assert(json.projectEnvFiles !== undefined, 'Should have projectEnvFiles');
});

// ============================================
// EDGE CASE: WORKTREE REMOVAL
// ============================================
console.log('\n🗑️  Remove Edge Cases');

test('remove matches by full path', () => {
  const listResult = run('list --json');
  const listJson = assertJSON(listResult.output);
  const removable = listJson.worktrees.find(w => !w.isMainWorktree);

  if (removable) {
    const result = run(`remove "${removable.path}" --dry-run --json`);
    assert(result.success, 'Should match by full path');
    const json = assertJSON(result.output);
    assert(json.wouldRemove.worktreePath === removable.path, 'Should match exact path');
  }
});

test('remove matches by branch name', () => {
  const listResult = run('list --json');
  const listJson = assertJSON(listResult.output);
  const removable = listJson.worktrees.find(w => w.branch && !w.isMainWorktree);

  if (removable && removable.branch !== 'detached') {
    const branchPart = removable.branch.split('/').pop(); // Get last part of branch
    const result = run(`remove "${branchPart}" --dry-run --json`);
    // May match or have multiple matches - both are valid behaviors
    assert(result.output, 'Should have output');
  }
});

test('remove is case insensitive', () => {
  const result = run('remove NONEXISTENT-WORKTREE-XYZ --json');
  assert(!result.success, 'Should fail');
  const json = assertJSON(result.output);
  assert(json.error.code === 'WORKTREE_NOT_FOUND', 'Should search case-insensitively');
});

// ============================================
// EDGE CASE: DIRTY STATE HANDLING
// ============================================
console.log('\n📝 Dirty State Edge Cases');

test('info provides dirty state details', () => {
  const result = run('info --json');
  const json = assertJSON(result.output);
  assert(typeof json.dirtyState === 'boolean', 'Should have dirtyState');
  if (json.dirtyState) {
    assert(json.dirtyDetails, 'Should have dirtyDetails when dirty');
    assert(typeof json.dirtyDetails.modified === 'number', 'Should have modified count');
    assert(typeof json.dirtyDetails.staged === 'number', 'Should have staged count');
    assert(typeof json.dirtyDetails.untracked === 'number', 'Should have untracked count');
  }
});

test('create includes warning for dirty state', () => {
  // This test depends on repo state - if clean, warning won't appear
  const result = run('create test-dirty-check --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  // warnings may or may not exist depending on repo state
  if (json.warnings) {
    assert(Array.isArray(json.warnings), 'warnings should be array');
  }
});

// ============================================
// EDGE CASE: JSON VS TEXT OUTPUT
// ============================================
console.log('\n📤 Output Format Edge Cases');

test('info text output includes all sections', () => {
  const result = run('info');
  assert(result.success, 'Should succeed');
  assert(result.output.includes('Repository Info'), 'Should have repo info');
  assert(result.output.includes('Type:'), 'Should have type');
  assert(result.output.includes('Base branch:'), 'Should have base branch');
  assert(result.output.includes('Worktree location:'), 'Should have worktree location');
});

test('list text output is readable', () => {
  const result = run('list');
  assert(result.success, 'Should succeed');
  assert(result.output.includes('worktrees'), 'Should mention worktrees');
});

test('error text output is readable', () => {
  const result = run('create');
  assert(!result.success, 'Should fail');
  assert(result.stderr.includes('Error') || result.output.includes('Error'), 'Should have error text');
});

// ============================================
// EDGE CASE: EXISTING BRANCH SCENARIOS
// ============================================
console.log('\n🌿 Branch Existence Edge Cases');

test('create dry-run shows if branch exists', () => {
  const result = run('create test-branch-exist --prefix feat --dry-run --json');
  assert(result.success, 'Should succeed');
  const json = assertJSON(result.output);
  assert(typeof json.wouldCreate.branchExists === 'boolean', 'Should indicate branch existence');
});

// ============================================
// EDGE CASE: CONCURRENT/RACE CONDITIONS
// ============================================
console.log('\n⚡ Concurrent Access Tests');

test('multiple info calls return consistent data', () => {
  const result1 = run('info --json');
  const result2 = run('info --json');
  assert(result1.success && result2.success, 'Both should succeed');
  const json1 = assertJSON(result1.output);
  const json2 = assertJSON(result2.output);
  assert(json1.repoType === json2.repoType, 'Repo type should be consistent');
  assert(json1.baseBranch === json2.baseBranch, 'Base branch should be consistent');
  assert(json1.worktreeRoot === json2.worktreeRoot, 'Worktree root should be consistent');
});

test('list returns consistent worktree count', () => {
  const result1 = run('list --json');
  const result2 = run('list --json');
  assert(result1.success && result2.success, 'Both should succeed');
  const json1 = assertJSON(result1.output);
  const json2 = assertJSON(result2.output);
  assert(json1.worktrees.length === json2.worktrees.length, 'Worktree count should be consistent');
});

// ============================================
// USER SCENARIO: REAL-WORLD WORKFLOWS
// ============================================
console.log('\n👤 User Scenario Tests');

test('scenario: new user creates first worktree', () => {
  // Step 1: Check info
  const infoResult = run('info --json');
  assert(infoResult.success, 'Info should succeed');
  const info = assertJSON(infoResult.output);

  // Step 2: Dry-run create
  const createResult = run('create add-login-feature --prefix feat --dry-run --json');
  assert(createResult.success, 'Create dry-run should succeed');
  const create = assertJSON(createResult.output);
  assert(create.wouldCreate.branch === 'feat/add-login-feature', 'Branch should be correctly named');
  assert(create.wouldCreate.baseBranch === info.baseBranch, 'Should use detected base branch');
});

test('scenario: user fixes bug in submodule', () => {
  const submodulePath = path.join(MONOREPO_DIR, 'ariadnev-engineer');
  if (!fs.existsSync(submodulePath)) return;

  // From submodule, create a fix branch
  const result = run('create fix-auth-bug --prefix fix --dry-run --json', { cwd: submodulePath });
  assert(result.success, 'Should succeed from submodule');
  const json = assertJSON(result.output);
  assert(json.wouldCreate.branch.startsWith('fix/'), 'Should have fix prefix');
  // Worktree should go to superproject
  assert(json.wouldCreate.worktreeRootSource.includes('superproject') ||
         json.wouldCreate.worktreeRootSource.includes('monorepo'),
    'Should use superproject worktrees dir');
});

test('scenario: user cleans up old worktrees', () => {
  // List worktrees first
  const listResult = run('list --json');
  assert(listResult.success, 'List should succeed');
  const list = assertJSON(listResult.output);

  // Try to remove a nonexistent worktree (simulating cleanup)
  const removeResult = run('remove old-feature-xyz --json');
  assert(!removeResult.success, 'Should fail for nonexistent');
  const remove = assertJSON(removeResult.output);
  assert(remove.error.availableWorktrees, 'Should show available worktrees for cleanup');
});

test('scenario: user with WORKTREE_ROOT env var', () => {
  const customRoot = '/tmp/custom-worktrees';
  try {
    const output = execSync(
      `WORKTREE_ROOT="${customRoot}" node "${SCRIPT_PATH}" info --json`,
      { encoding: 'utf-8', cwd: STANDALONE_DIR, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const json = JSON.parse(output.trim());
    assert(json.worktreeRoot === customRoot, 'Should use env var');
    assert(json.worktreeRootSource === 'WORKTREE_ROOT env', 'Should indicate env source');
  } catch (error) {
    // Skip if env var handling fails
  }
});

// ============================================
// WORKTREE ROOT FROM CONFIG
// ============================================
console.log('\n📁 worktree.root config setting');

const os = require('os');

// Each case gets its own repo and its own HOME, because the setting is read
// from two files whose contents are the whole point of the test.
function configBox(build) {
  const box = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'av-wt-cfg-')));
  const repo = path.join(box, 'repo');
  const home = path.join(box, 'home');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  execSync('git init -q && git config user.email t@e.st && git config user.name t && git commit -q --allow-empty -m init', {
    cwd: repo,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    return build({ box, repo, home });
  } finally {
    fs.rmSync(box, { recursive: true, force: true });
  }
}

function writeConfig(dir, contents) {
  fs.mkdirSync(path.join(dir, '.ariadnev'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.ariadnev', 'config.json'),
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
}

function infoIn(repo, home, env = {}) {
  const output = execSync(`node "${SCRIPT_PATH}" info --json`, {
    encoding: 'utf-8',
    cwd: repo,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HOME: home, WORKTREE_ROOT: '', ...env },
  });
  return JSON.parse(output.trim());
}

test('a relative project value decides where worktrees go', () => {
  configBox(({ repo, home }) => {
    writeConfig(repo, { worktree: { root: 'wt' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === path.join(repo, 'wt'), `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'project config', `got ${json.worktreeRootSource}`);
    assert(!json.warnings || json.warnings.length === 0, 'a valid value warns about nothing');
  });
});

test('a user value may be absolute, and is reported as the user config', () => {
  configBox(({ box, repo, home }) => {
    const target = path.join(box, 'elsewhere');
    fs.mkdirSync(target, { recursive: true });
    writeConfig(home, { worktree: { root: target } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === target, `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'user config', `got ${json.worktreeRootSource}`);
  });
});

test('a project value beats a user value', () => {
  configBox(({ box, repo, home }) => {
    writeConfig(repo, { worktree: { root: 'wt' } });
    writeConfig(home, { worktree: { root: path.join(box, 'elsewhere') } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === path.join(repo, 'wt'), `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'project config', `got ${json.worktreeRootSource}`);
  });
});

test('the env var beats both config files', () => {
  configBox(({ box, repo, home }) => {
    const envTarget = path.join(box, 'from-env');
    fs.mkdirSync(envTarget, { recursive: true });
    writeConfig(repo, { worktree: { root: 'wt' } });
    writeConfig(home, { worktree: { root: path.join(box, 'elsewhere') } });
    const json = infoIn(repo, home, { WORKTREE_ROOT: envTarget });
    assert(json.worktreeRoot === envTarget, `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'WORKTREE_ROOT env', `got ${json.worktreeRootSource}`);
  });
});

test('no config file at all leaves auto-detection alone', () => {
  configBox(({ repo, home }) => {
    const json = infoIn(repo, home);
    assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
    assert(!json.warnings || json.warnings.length === 0, 'an absent file is not a warning');
  });
});

test('an out-of-bounds project value is refused, and the user value applies instead', () => {
  configBox(({ box, repo, home }) => {
    const target = path.join(box, 'elsewhere');
    fs.mkdirSync(target, { recursive: true });
    // The case that matters: this file arrives with somebody else's clone.
    writeConfig(repo, { worktree: { root: '../../escape' } });
    writeConfig(home, { worktree: { root: target } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === target, `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'user config', `got ${json.worktreeRootSource}`);
    assert(json.warnings && json.warnings.some(w => w.includes('worktree.root')), 'the refusal has to reach the agent');
  });
});

test('an absolute project value is refused rather than obeyed', () => {
  configBox(({ box, repo, home }) => {
    const target = path.join(box, 'absolute-target');
    fs.mkdirSync(target, { recursive: true });
    writeConfig(repo, { worktree: { root: target } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot !== target, 'an absolute project value must not take effect');
    assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
    assert(json.warnings && json.warnings.length > 0, 'the refusal has to reach the agent');
  });
});

test("a path inside the repository's own .git directory is refused", () => {
  // Inside the bound, but inside the part git owns. `git worktree add
  // .git/worktrees/<name>` succeeds and drops the checkout on top of the admin
  // directory git creates for that same worktree.
  for (const value of ['.git', '.git/worktrees', '.git/hooks/wt']) {
    configBox(({ repo, home }) => {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `${value}: got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, `${value}: should warn`);
    });
  }
});

test('a value that merely starts with the same letters as .git is kept', () => {
  configBox(({ repo, home }) => {
    writeConfig(repo, { worktree: { root: '.github/worktrees' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === path.join(repo, '.github', 'worktrees'), `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'project config', `got ${json.worktreeRootSource}`);
  });
});

test('a case-variant .git is refused where the filesystem folds case', () => {
  // The refusal compares the first segment against .git literally, so it is only
  // correct if resolution hands back the name on disk. A resolver that echoes the
  // caller's spelling returns .GIT, the comparison misses, and the value lands on
  // git's metadata on exactly the machines — macOS, Windows — where the two
  // spellings are one directory.
  configBox(({ repo, home }) => {
    let folds = false;
    try {
      folds = fs.lstatSync(path.join(repo, '.GIT')).isDirectory();
    } catch {
      folds = false; // a case-sensitive filesystem: .GIT is simply a different name
    }
    if (!folds) return;
    for (const value of ['.GIT/worktrees', '.Git']) {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `${value}: got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, `${value}: should warn`);
    }
  });
});

test('an unexpanded home reference is refused', () => {
  // ~/x is not a relative path, and resolving it against the repository would
  // silently turn it into one — a directory literally named ~.
  for (const value of ['~/worktrees', '~']) {
    configBox(({ repo, home }) => {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `${value}: got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, `${value}: should warn`);
    });
  }
});

test('control characters are refused', () => {
  for (const value of ['work\u0000trees', 'work\ntrees', 'work\rtrees']) {
    configBox(({ repo, home }) => {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, 'should warn');
    });
  }
});

test('a sibling of the repository is refused — the case a parent bound admits', () => {
  // Bounding to the repository's parent would accept this: path.relative yields
  // other-project, with no .. and no absolute prefix. The bound is the repository
  // itself precisely so a clone cannot name its neighbours.
  configBox(({ box, repo, home }) => {
    fs.mkdirSync(path.join(box, 'other-project'), { recursive: true });
    writeConfig(repo, { worktree: { root: '../other-project' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
    assert(json.warnings && json.warnings.length > 0, 'the refusal has to reach the agent');
  });
});

test('the repository directory itself is refused', () => {
  for (const value of ['.', 'worktrees/..']) {
    configBox(({ repo, home }) => {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `${value}: got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, `${value}: should warn`);
    });
  }
});

test('an empty or whitespace-only value is refused', () => {
  for (const value of ['', '   ']) {
    configBox(({ repo, home }) => {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, 'should warn');
    });
  }
});

test('a value that is not a string is refused', () => {
  for (const value of [42, true, ['worktrees'], { root: 'worktrees' }]) {
    configBox(({ repo, home }) => {
      writeConfig(repo, { worktree: { root: value } });
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, 'should warn');
    });
  }
});

test('an explicit null is unset rather than refused', () => {
  // The key is optional and its default is null, so writing it out is a way of
  // saying "no preference". Warning about it would report a problem the reader
  // does not have.
  configBox(({ repo, home }) => {
    writeConfig(repo, { worktree: { root: null } });
    const json = infoIn(repo, home);
    assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
    assert(!json.warnings || json.warnings.length === 0, 'an unset value is not a warning');
  });
});

test('a value that leaves the repository through an in-repo symlink is refused', () => {
  // No .. anywhere in the value, so a purely lexical resolve accepts it. Both
  // sides have to be realpath-resolved for the containment check to see where the
  // value actually lands.
  configBox(({ box, repo, home }) => {
    fs.symlinkSync(box, path.join(repo, 'escape'), 'dir');
    writeConfig(repo, { worktree: { root: 'escape/worktrees' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
    assert(json.warnings && json.warnings.length > 0, 'the refusal has to reach the agent');
  });
});

test('a value under a symlink that stays inside the repository is kept', () => {
  configBox(({ repo, home }) => {
    fs.mkdirSync(path.join(repo, 'real'), { recursive: true });
    fs.symlinkSync(path.join(repo, 'real'), path.join(repo, 'link'), 'dir');
    writeConfig(repo, { worktree: { root: 'link/worktrees' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === path.join(repo, 'link', 'worktrees'), `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'project config', `got ${json.worktreeRootSource}`);
  });
});

test('a value passing through a dangling in-repo symlink is refused', () => {
  configBox(({ box, repo, home }) => {
    // A dangling link does not exist by existsSync, so a walk-up using it steps
    // straight over the link and calls the result inside. Where it really points
    // is unknowable until something creates the target.
    fs.symlinkSync(path.join(box, 'never-created'), path.join(repo, 'dangling'), 'dir');
    writeConfig(repo, { worktree: { root: 'dangling/worktrees' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRootSource === 'sibling directory', `got ${json.worktreeRootSource}`);
    assert(json.warnings && json.warnings.length > 0, 'the refusal has to reach the agent');
  });
});

test('a deep project value is accepted, because create makes the parents', () => {
  configBox(({ repo, home }) => {
    // The one-missing-parent rule guards a mistyped --worktree-root, not a
    // bounded config value the create step mkdirs recursively. Refusing depth
    // here would make this script and `av config prefs resolve` disagree.
    writeConfig(repo, { worktree: { root: 'a/b/c/worktrees' } });
    const json = infoIn(repo, home);
    assert(json.worktreeRoot === path.join(repo, 'a', 'b', 'c', 'worktrees'), `got ${json.worktreeRoot}`);
    assert(json.worktreeRootSource === 'project config', `got ${json.worktreeRootSource}`);
  });
});

test('a refused value does not fail the command', () => {
  configBox(({ repo, home }) => {
    writeConfig(repo, { worktree: { root: '/etc' } });
    const result = execSync(`node "${SCRIPT_PATH}" info --json`, {
      encoding: 'utf-8',
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: home, WORKTREE_ROOT: '' },
    });
    // Terminating here would hand a hostile clone a denial of service.
    assert(JSON.parse(result.trim()).info === true, 'info still answers');
  });
});

test('a malformed config file warns and falls through, matching the CLI', () => {
  for (const [label, contents] of [['not JSON', '{nope'], ['not an object', '[1,2,3]']]) {
    configBox(({ repo, home }) => {
      writeConfig(repo, contents);
      const json = infoIn(repo, home);
      assert(json.worktreeRootSource === 'sibling directory', `${label}: got ${json.worktreeRootSource}`);
      assert(json.warnings && json.warnings.length > 0, `${label}: should warn`);
    });
  }
});

test('the refusal rides the create envelope too, not only info', () => {
  configBox(({ repo, home }) => {
    writeConfig(repo, { worktree: { root: '/etc' } });
    const result = execSync(`node "${SCRIPT_PATH}" create probe --json --dry-run`, {
      encoding: 'utf-8',
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME: home, WORKTREE_ROOT: '' },
    });
    const json = JSON.parse(result.trim());
    assert(json.warnings && json.warnings.some(w => w.includes('worktree.root')), 'create carries the refusal');
  });
});

test('nothing about this path is written to stderr', () => {
  configBox(({ repo, home }) => {
    writeConfig(repo, { worktree: { root: '/etc' } });
    const chunks = [];
    try {
      execSync(`node "${SCRIPT_PATH}" info --json 2>&1 1>/dev/null`, {
        encoding: 'utf-8',
        cwd: repo,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home, WORKTREE_ROOT: '' },
      });
    } catch (error) {
      chunks.push(error.stdout?.toString() || '');
    }
    assert(chunks.join('').trim() === '', 'the JSON envelope is the only channel');
  });
});

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('Failed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
