#!/usr/bin/env node
// Kit identity stays separate because moving it to core would break kit-specific branding and configuration.
'use strict';

/**
 * Claude Code statusline renderer — reads JSON from stdin, writes ANSI lines to stdout.
 * Rendering is config-driven via statuslineLayout in the ariadnev config.
 * When statuslineLayout is absent, output is IDENTICAL to pre-refactor behavior.
 */

const { stdin, env } = require('process');
const os = require('os');

// The shared library sits beside this file when installed and one level up in
// the kit checkout — the same probe the hooks use, for the same reason: a
// hard-coded relative path resolves to nothing in the other layout.
const AV_LIB = (name) => require('node:path').join(
  [require('node:path').join(__dirname, '_lib'), require('node:path').join(__dirname, '..', 'hooks', '_lib')]
    .find((dir) => require('node:fs').existsSync(dir)) || require('node:path').join(__dirname, '_lib'),
  name,
);

const {
  createSessionStateContext,
  loadConfig,
  readSessionState,
  writeContextState
} = require(AV_LIB("av-config-utils.cjs"));
const { getGitInfo } = require(AV_LIB("git-info-cache.cjs"));
const { readActivitySnapshot } = require(AV_LIB("statusline-session-cache.cjs"));
const {
  readUsageCache,
  normalizeUtilization,
  isUsageCacheFresh,
  resolveQuotaDisplayEligibility
} = require(AV_LIB("usage-limits-cache.cjs"));
const { resolveLayout } = require(AV_LIB("statusline-section-registry.cjs"));
const { render, renderCompact, renderMinimal } = require(AV_LIB("statusline-render-modes.cjs"));
const { formatCountdown } = require(AV_LIB("statusline-string-utils.cjs"));

const AUTOCOMPACT_BUFFER = 40000;
const USAGE_CACHE_RENDER_TTL_MS = 300000;

// ============================================================================
// UTILITIES
// ============================================================================

function expandHome(filePath) {
  const homeDir = os.homedir();
  return filePath.startsWith(homeDir) ? filePath.replace(homeDir, '~') : filePath;
}

// Read stdin with optional inactivity timeout (CK_STATUSLINE_STDIN_TIMEOUT_MS)
async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stdin.setEncoding('utf8');
    const parsedTimeout = Number.parseInt(env.CK_STATUSLINE_STDIN_TIMEOUT_MS || '', 10);
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 0;
    let timer = null;
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const armTimer = () => {
      if (!timeoutMs) return;
      clearTimer();
      timer = setTimeout(() => reject(new Error(`stdin timeout after ${timeoutMs}ms`)), timeoutMs);
    };
    armTimer();
    stdin.on('data', chunk => { chunks.push(chunk); armTimer(); });
    stdin.on('end', () => { clearTimer(); resolve(chunks.join('')); });
    stdin.on('error', err => { clearTimer(); reject(err); });
  });
}

// Build usage window strings from cache (e.g. ["5h 20% (1h30m)", "wk 45% (4d)"])
function buildUsageWindows(cache) {
  if (!cache || cache.status !== 'available') return [];
  if (!isUsageCacheFresh(cache, USAGE_CACHE_RENDER_TTL_MS)) return [];
  const now = Date.now();
  // Prefer pre-calculated snapshot percentages (with reset countdown when available)
  const snap = [
    { label: '5h', percent: cache.snapshot?.fiveHourPercent, resetsAt: cache.data?.five_hour?.resets_at },
    { label: 'wk', percent: cache.snapshot?.weekPercent,     resetsAt: cache.data?.seven_day?.resets_at }
  ].map(({ label, percent, resetsAt }) => {
    if (percent == null) return null;
    let countdown = '';
    if (resetsAt) {
      const cd = formatCountdown(new Date(resetsAt).getTime() - now);
      if (cd) countdown = ` (${cd})`;
    }
    return `${label} ${percent}%${countdown}`;
  }).filter(Boolean);
  if (snap.length > 0) return snap;
  // Fall back to raw utilization values (no resets_at countdown in fallback path)
  return [
    { label: '5h', value: cache.data?.five_hour?.utilization },
    { label: 'wk', value: cache.data?.seven_day?.utilization }
  ].map(({ label, value }) => {
    const pct = normalizeUtilization(value);
    return pct == null ? null : `${label} ${pct}%`;
  }).filter(Boolean);
}

function extractActivePlanLabel(planPath) {
  if (!planPath || typeof planPath !== 'string') return '';
  const normalizedPath = planPath.trim().replace(/\\/g, '/');
  const match = normalizedPath.match(/(?:^|\/)plans\/\d+-\d+-(.+?)(?:\/|$)/);
  if (match) return match[1];
  return normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    const input = await readStdin();
    // Empty stdin means the provider sent nothing, which is not the user's
    // problem to see: this runs on every redraw, so an error line here becomes
    // an error line on every keystroke. Draw the fallback and exit clean, the
    // same as the catch below.
    if (!input.trim()) { console.log('📁 ' + (process.cwd() || 'unknown')); return; }

    const data = JSON.parse(input);
    const sessionContext = createSessionStateContext({
      sessionId: data.session_id,
      cwd: process['env'].CK_PROJECT_ROOT || data.workspace?.current_dir || data.cwd || process.cwd(),
      requireBinding: true
    });

    // Directory
    let currentDir = data.workspace?.current_dir || data.cwd || 'unknown';
    currentDir = expandHome(currentDir);

    const modelName = data.model?.display_name || 'Claude';

    // Git info
    const gitInfo = getGitInfo(data.workspace?.current_dir || data.cwd || process.cwd());
    const gitBranch   = gitInfo?.branch   || '';
    const gitUnstaged = gitInfo?.unstaged || 0;
    const gitStaged   = gitInfo?.staged   || 0;
    const gitAhead    = gitInfo?.ahead    || 0;
    const gitBehind   = gitInfo?.behind   || 0;

    // Session state (active plan + activity snapshot)
    let activePlan = '';
    let transcript = { agents: [], todos: [], sessionStart: null };
    try {
      if (sessionContext) {
        const session = readSessionState(sessionContext);
        const planPath = session?.activePlan?.trim();
        if (planPath) activePlan = extractActivePlanLabel(planPath);
        transcript = readActivitySnapshot(sessionContext, readSessionState) || transcript;
      }
    } catch {}

    // Context window percentage
    const usage = data.context_window?.current_usage || {};
    const contextSize = data.context_window?.context_window_size || 0;
    let contextPercent = 0;
    let totalTokens = 0;
    if (contextSize > 0) {
      totalTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      const preCalc = data.context_window?.used_percentage;
      if (typeof preCalc === 'number' && preCalc >= 0) {
        contextPercent = Math.round(preCalc);
      } else if (contextSize > AUTOCOMPACT_BUFFER) {
        contextPercent = Math.min(100, Math.round(((totalTokens + AUTOCOMPACT_BUFFER) / contextSize) * 100));
      }
    }

    // Persist context data for hooks
    if (sessionContext && contextSize > 0) {
      try {
        writeContextState(sessionContext, {
          percent: contextPercent,
          remaining: data.context_window?.remaining_percentage ?? (100 - contextPercent),
          tokens: totalTokens,
          size: contextSize,
          usage,
          timestamp: Date.now()
        });
      } catch {}
    }

    // Config
    const config = loadConfig({ includeProject: false, includeAssertions: false, includeLocale: false });
    // The ariadnev config nests these (`statusline.mode`, `statusline.quota`);
    // upstream had them flat. Reading the flat names here would silently mean
    // "unset" forever — the bar would render in `full` no matter what the user
    // configured, and nothing would report it.
    const statuslineMode = config.statusline?.mode || 'full';
    const usageWindows = config.statusline?.quota === false
      ? []
      : (resolveQuotaDisplayEligibility({ useCache: true }).eligible
          ? buildUsageWindows(readUsageCache())
          : []);

    // Cost + lines changed
    const billingMode = env.CLAUDE_BILLING_MODE || 'api';
    const costUSD = data.cost?.total_cost_usd;
    const costText = billingMode === 'api' && costUSD && /^\d+(\.\d+)?$/.test(String(costUSD))
      ? `$${parseFloat(costUSD).toFixed(4)}`
      : null;
    const linesAdded   = data.cost?.total_lines_added   || 0;
    const linesRemoved = data.cost?.total_lines_removed || 0;

    // Render context
    const ctx = {
      modelName, currentDir,
      gitBranch, gitUnstaged, gitStaged, gitAhead, gitBehind,
      activePlan, contextPercent, usageWindows,
      costText, linesAdded, linesRemoved,
      transcript
    };

    // NO_COLOR is checked inside isColorEnabled() and always wins. There is no
    // config key for colour: upstream had one driven by a dashboard this port
    // does not include, and a setting nothing can set is worse than none.

    // Section layout is the built-in default for the same reason — upstream's
    // custom layouts came from that dashboard.
    const layout = resolveLayout(undefined);

    // Dispatch to render mode
    switch (statuslineMode) {
      case 'none':    console.log(''); break;
      case 'minimal': renderMinimal(ctx, layout); break;
      case 'compact': renderCompact(ctx, layout); break;
      case 'full':
      default:        render(ctx, layout, false); break;
    }

  } catch {
    console.log('📁 ' + (process.cwd() || 'unknown'));
  }
}

main().catch(() => { console.log('📁 error'); process.exit(1); });
