// GENERATED FILE — do not edit.
// Source: packages/cli/src/config/config-schema.ts
// Regenerate: pnpm --filter @ariadnev/cli generate:config-schema
//
// Which config keys exist, what type each holds, and — the part that matters —
// which layer may set it. A project file may set a `project` key; a `user` key
// is read from the user's own config only, so a cloned repository cannot turn
// off privacy blocking or redirect a notification.
'use strict';

module.exports = {
  "schemaVersion": 1,
  "notificationHosts": [
    "discord.com",
    "slack.com",
    "api.telegram.org"
  ],
  "fields": {
    "privacyBlock": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "assertions": {
      "layer": "user",
      "type": "string[]",
      "default": []
    },
    "trust.enabled": {
      "layer": "user",
      "type": "boolean",
      "default": false
    },
    "scripts.executionPolicy": {
      "layer": "user",
      "type": "string",
      "default": "allow",
      "enum": [
        "allow",
        "never"
      ]
    },
    "hooks.cook-after-plan-reminder": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.descriptive-name": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.dev-rules-reminder": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.plan-format-kanban": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.precompact-capture": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.privacy-block": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.scout-block": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.secret-output-guardrail": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.session-init": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.session-state": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.simplify-gate": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.subagent-init": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.team-context-inject": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "hooks.usage-quota-cache-refresh": {
      "layer": "user",
      "type": "boolean",
      "default": true
    },
    "notifications.enabled": {
      "layer": "user",
      "type": "boolean",
      "default": false
    },
    "notifications.discordWebhook": {
      "layer": "user",
      "type": "webhook",
      "default": null
    },
    "notifications.slackWebhook": {
      "layer": "user",
      "type": "webhook",
      "default": null
    },
    "notifications.telegramBotToken": {
      "layer": "user",
      "type": "string",
      "default": null
    },
    "notifications.telegramChatId": {
      "layer": "user",
      "type": "string",
      "default": null
    },
    "paths.docs": {
      "layer": "project",
      "type": "string",
      "default": "docs"
    },
    "paths.plans": {
      "layer": "project",
      "type": "string",
      "default": "plans"
    },
    "docs.maxLoc": {
      "layer": "project",
      "type": "integer",
      "default": 800
    },
    "plan.namingFormat": {
      "layer": "project",
      "type": "string",
      "default": "{date}-{issue}-{slug}"
    },
    "plan.dateFormat": {
      "layer": "project",
      "type": "string",
      "default": "YYMMDD-HHmm"
    },
    "plan.issuePrefix": {
      "layer": "project",
      "type": "string",
      "default": "GH-"
    },
    "plan.reportsDir": {
      "layer": "project",
      "type": "string",
      "default": "reports"
    },
    "locale.thinkingLanguage": {
      "layer": "project",
      "type": "string",
      "default": null
    },
    "locale.responseLanguage": {
      "layer": "project",
      "type": "string",
      "default": null
    },
    "project.type": {
      "layer": "project",
      "type": "string",
      "default": "auto"
    },
    "project.packageManager": {
      "layer": "project",
      "type": "string",
      "default": "auto"
    },
    "project.framework": {
      "layer": "project",
      "type": "string",
      "default": "auto"
    },
    "statusline.mode": {
      "layer": "project",
      "type": "string",
      "default": "full",
      "enum": [
        "full",
        "compact",
        "minimal",
        "off"
      ]
    },
    "statusline.quota": {
      "layer": "project",
      "type": "boolean",
      "default": true
    }
  }
};
