/**
 * What a notification is allowed to say.
 *
 * The module this replaces sent the absolute working directory, the derived
 * project name, and the session id to a third-party chat service on every stop.
 * A notification exists to tell you a session finished; none of that is needed
 * to say so, and all of it describes a machine the recipient service has no
 * business knowing about.
 *
 * The payload is therefore built by allowlist, not by redaction: this module
 * names the fields that may leave, so a new field in a hook payload cannot start
 * flowing outward just because nobody thought to strip it.
 */

'use strict';

/** Events worth a notification, mapped to the line they produce. */
const EVENT_TITLES = {
  Stop: 'Session finished',
  SubagentStop: 'Subagent finished',
  Notification: 'Waiting for input',
  SessionEnd: 'Session ended'
};

/** An agent/skill name must look like one before it is forwarded. */
const NAME_SHAPE = /^[A-Za-z0-9][A-Za-z0-9 _:-]{0,48}$/;

/**
 * Build the outbound payload from a hook's stdin JSON.
 *
 * @param {Object} input Raw hook payload.
 * @returns {{event: string, title: string, agent: string|null}|null} null when
 *   the event is not one this module notifies about.
 */
function buildPayload(input) {
  const event = input && typeof input.hook_event_name === 'string' ? input.hook_event_name : '';
  const title = EVENT_TITLES[event];
  if (!title) return null;

  const rawAgent = input && typeof input.agent_type === 'string' ? input.agent_type : '';
  const agent = NAME_SHAPE.test(rawAgent) ? rawAgent : null;

  return { event, title, agent };
}

/** One line of text, the only thing any provider is given to render. */
function renderText(payload) {
  return payload.agent ? `ariadnev — ${payload.title}: ${payload.agent}` : `ariadnev — ${payload.title}`;
}

module.exports = { EVENT_TITLES, buildPayload, renderText };
