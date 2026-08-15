# Notifications

Send one line to Discord, Slack, or Telegram when a session or a subagent
finishes. Off unless you turn it on, and not bound to any event by the
installer — wiring it up is a deliberate act, because it sends your activity to
a third party.

## Turn it on

In **your own** config, `~/.ariadnev/config.json`:

```json
{
  "notifications": {
    "enabled": true,
    "slackWebhook": "https://hooks.slack.com/services/T00000000/B00000000/xxxxxxxx"
  }
}
```

Destinations are user-only settings. A project's `.ariadnev/config.json` cannot
set one — a repository you cloned must not be able to decide where your session
activity goes. `ariadnev config prefs resolve` shows what took effect (a
configured destination prints as `<redacted>`; an unset one prints as `null`).

Available destinations: `discordWebhook`, `slackWebhook`, and the pair
`telegramBotToken` + `telegramChatId` (both required). A destination must be an
https URL on `discord.com`, `slack.com`, or `api.telegram.org` — a subdomain of
those is fine, a lookalike like `hooks.slack.com.evil.test` is not. Anything else
is dropped when the config is read, and refused again at the point the request
would leave the machine.

## Wire it to an event

Add it to `.claude/settings.json` yourself, for whichever event you want:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/av/_lib/notifications/notify.cjs\"" }] }
    ]
  }
}
```

It notifies on `Stop`, `SubagentStop`, `Notification`, and `SessionEnd`; any
other event produces nothing.

## What gets sent

The event, and for a subagent its type — that is the whole payload:

```
ariadnev — Subagent finished: code-reviewer
```

Not the working directory, the project name, the session id, the prompt, or any
tool input. The payload is built from an allowlist rather than by stripping
fields, so a new field appearing in a hook payload cannot start flowing outward
because nobody remembered to remove it.

A failing destination is retried no sooner than five minutes later, and a
notification never fails the session it is reporting on.
