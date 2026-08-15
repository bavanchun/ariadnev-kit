/**
 * Turns a payload plus the user's configured destinations into HTTP requests.
 *
 * Pure: it returns request descriptions and never performs one, so the shape of
 * what would be sent is testable without a network and without a fake server.
 *
 * Destinations come from `av-config-client`, which reads the *user's* config
 * only for these keys and rejects any URL that is not https on an allowlisted
 * host. A project file cannot introduce a destination, which is the whole reason
 * this module does not read the environment at all — an env-var cascade is how
 * the module this replaces let a repository choose where your notifications go.
 */

'use strict';

const { renderText } = require('./payload.cjs');

/**
 * @param {Object} payload From buildPayload.
 * @param {Object} notifications Resolved `notifications` config section.
 * @returns {Array<{provider: string, url: string, body: Object}>}
 */
function buildRequests(payload, notifications) {
  if (!notifications || notifications.enabled !== true) return [];
  const text = renderText(payload);
  const requests = [];

  if (notifications.discordWebhook) {
    requests.push({ provider: 'discord', url: notifications.discordWebhook, body: { content: text } });
  }
  if (notifications.slackWebhook) {
    requests.push({ provider: 'slack', url: notifications.slackWebhook, body: { text } });
  }
  if (notifications.telegramBotToken && notifications.telegramChatId) {
    requests.push({
      provider: 'telegram',
      url: `https://api.telegram.org/bot${notifications.telegramBotToken}/sendMessage`,
      body: { chat_id: notifications.telegramChatId, text }
    });
  }
  return requests;
}

module.exports = { buildRequests };
