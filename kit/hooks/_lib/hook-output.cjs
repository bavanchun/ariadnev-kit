'use strict';

// The one place hook stdout is shaped.
//
// Three runtimes read it and they do not accept the same envelope. Codex's hook
// schemas are `additionalProperties: false`, so a key in the wrong place is not
// ignored — the whole decision is rejected and the user sees `Hook failed`
// instead of the deny the hook meant. Claude Code accepts the loose shapes, so
// a mistake here is invisible on the runtime the corpus was written against and
// only surfaces on the others.
//
// Claude Code and Codex differ in one place only:
// `hookSpecificOutput.additionalContext` is the context envelope on both, and
// the genuine difference is the older shape — the loose stdout Claude Code
// reads as context on SessionStart and UserPromptSubmit, which Codex validates
// against schemas with no place for text.
//
// Antigravity is not a third strictness setting on the same envelope. Its five
// events each answer in a vocabulary of their own, documented in the provider's
// own `agy-customizations/docs/hooks.md`: `PreToolUse` takes a top-level
// `decision` of allow/deny/ask/force_ask with an optional `reason`,
// `PostToolUse` expects `{}`, and `Stop` is blocked by answering `continue` —
// the word Claude Code uses for letting the agent go on. None of the five
// carries injected context, so a hook with only context to offer says nothing
// there rather than emitting a field the runtime will not read.

const { readRuntimeMarker } = require('./runtime-state-identity.cjs');

/** The runtime the corpus was written for, and the fall-back when none is known. */
const DEFAULT_RUNTIME = 'claude-code';

/**
 * Keys that are legal inside `hookSpecificOutput` and never at the top level.
 *
 * `permissionDecision` at the top level is the exact shape issue #134
 * reproduces: Codex rejects the decision, so a block becomes a hook failure.
 */
const NESTED_ONLY_KEYS = ['permissionDecision', 'permissionDecisionReason', 'additionalContext', 'updatedInput'];

/**
 * Fields a PermissionRequest hook must never emit.
 *
 * The schema's own description says hooks currently fail closed if these are
 * present — setting one denies the request rather than doing nothing, which is
 * the opposite of what a hook reaching for them intends.
 */
const PERMISSION_REQUEST_FORBIDDEN = ['interrupt', 'updatedInput', 'updatedPermissions'];

/** Runtimes with an envelope of their own. Everything else is Claude Code. */
const NON_DEFAULT_RUNTIMES = new Set(['codex', 'antigravity']);

function resolveRuntime(runtime) {
  if (runtime === undefined) return readRuntimeMarker() || DEFAULT_RUNTIME;
  return NON_DEFAULT_RUNTIMES.has(runtime) ? runtime : DEFAULT_RUNTIME;
}

/** The decisions antigravity's PreToolUse accepts, in its own spelling. */
const ANTIGRAVITY_TOOL_DECISIONS = new Set(['allow', 'deny', 'ask', 'force_ask']);

/**
 * What a kit hook's answer becomes on antigravity, or `''` when it becomes
 * nothing.
 *
 * Saying nothing is a real answer here and the safe one. `decision` is required
 * on `PreToolUse`, so a hook that has no decision to make cannot fill it in
 * without changing behaviour: `allow` would skip a permission prompt the user
 * would otherwise see, and `ask` would raise one they would not. The same holds
 * on `Stop`, where every value except `continue` lets the agent stop and
 * `reason` is only carried when it is continuing — so a passing message has no
 * channel and inventing a decision to carry it would block a stop nobody asked
 * to block.
 *
 * Events outside the five are here too, because a binding for one is never
 * installed for this provider: if such a hook runs at all, whatever it writes
 * is read by nothing.
 */
function antigravityPayload(event, topLevel, nested) {
  if (event === 'PreToolUse') {
    const decision = nested && nested.permissionDecision;
    if (!ANTIGRAVITY_TOOL_DECISIONS.has(decision)) return '';
    const reason = nested.permissionDecisionReason;
    return render(reason ? { decision, reason } : { decision });
  }
  if (event === 'Stop') {
    if (topLevel.decision !== 'block') return '';
    return render(topLevel.reason ? { decision: 'continue', reason: topLevel.reason } : { decision: 'continue' });
  }
  if (event === 'PostToolUse') return render({});
  return '';
}

function render(payload) {
  return `${JSON.stringify(payload)}\n`;
}

function wrap(event, body) {
  return render({ hookSpecificOutput: { hookEventName: event, additionalContext: body } });
}

/** Empty context renders nothing at all: a hook with nothing to say stays silent. */
function normalize(text) {
  const body = typeof text === 'string' ? text : String(text ?? '');
  return body.trim() === '' ? '' : body;
}

/** The stdout a context-injecting hook should produce, as a string. */
function contextPayload(event, text, runtime) {
  const body = normalize(text);
  if (body === '') return '';
  if (resolveRuntime(runtime) === 'antigravity') return antigravityPayload(event, {}, null);
  return wrap(event, body);
}

/**
 * The stdout of a hook that writes its context as loose text.
 *
 * Claude Code reads plain stdout as context on SessionStart and UserPromptSubmit,
 * and the hooks using that shape predate the wrapped one. Codex rejects it, so it
 * gets the envelope while Claude Code keeps the bytes it already had — which is
 * why this is a second entry point rather than a rule inside `contextPayload`:
 * the two shapes are both correct on Claude Code, and only the call site knows
 * which one a hook has been emitting.
 */
function plainContextPayload(event, text, runtime) {
  const body = normalize(text);
  if (body === '') return '';
  const resolved = resolveRuntime(runtime);
  if (resolved === 'antigravity') return antigravityPayload(event, {}, null);
  return resolved === 'codex' ? wrap(event, body) : `${body}\n`;
}

/**
 * The stdout a deciding hook should produce, as a string.
 *
 * `topLevel` carries the flow-control keys (`continue`, `decision`, `reason`,
 * `stopReason`, `suppressOutput`, `systemMessage`); `nested` carries whatever
 * belongs under `hookSpecificOutput` for this event. Splitting them at the
 * signature is what makes the misplacement checks below possible at all.
 */
function decisionPayload(event, topLevel = {}, runtime, nested = null) {
  for (const key of NESTED_ONLY_KEYS) {
    if (key in topLevel) {
      throw new Error(`${key} belongs inside hookSpecificOutput, not at the top level of a ${event} decision`);
    }
  }
  if (event === 'PermissionRequest') {
    for (const key of PERMISSION_REQUEST_FORBIDDEN) {
      if (key in topLevel || (nested && key in nested)) {
        throw new Error(`${key} is not emittable on PermissionRequest: the runtime fails closed when it is present`);
      }
    }
  }
  if (resolveRuntime(runtime) === 'antigravity') return antigravityPayload(event, topLevel, nested);
  const payload = { ...topLevel };
  if (nested && Object.keys(nested).length > 0) {
    payload.hookSpecificOutput = { hookEventName: event, ...nested };
  }
  return render(payload);
}

function writeOut(text, options) {
  if (text === '') return '';
  const write = options.write || ((s) => process.stdout.write(s));
  write(text);
  return text;
}

/** Shape and write a context injection. Returns what was written. */
function emitContext(event, text, options = {}) {
  return writeOut(contextPayload(event, text, options.runtime), options);
}

/** Shape and write loose-text context. Returns what was written. */
function emitPlainContext(event, text, options = {}) {
  return writeOut(plainContextPayload(event, text, options.runtime), options);
}

/** Shape and write a decision. Returns what was written. */
function emitDecision(event, topLevel = {}, options = {}) {
  return writeOut(decisionPayload(event, topLevel, options.runtime, options.nested), options);
}

module.exports = {
  DEFAULT_RUNTIME,
  contextPayload,
  decisionPayload,
  emitContext,
  emitDecision,
  emitPlainContext,
  plainContextPayload
};
