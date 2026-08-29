// `av content publish | queue | schedule`.
//
// PUBLISHING IS AN OUTWARD-FACING WRITE, SO IT PREVIEWS UNLESS TOLD OTHERWISE.
// The same posture `av watch` takes, for the same reason: a command that sends
// something to the internet on its first invocation is one people run once by
// accident. `--yes` is what sends.
//
// No ariadnev-hosted channel exists and none will — see `content/channels.ts`.
// A channel is a webhook URL in the user's own file, and it must be https.
//
// `schedule` runs the queue rather than daemonising it. Upstream has `content
// schedule daemon`; a third long-lived process for a job the OS scheduler
// already does well is not worth its own supervision, pidfile and stop verb.
// `av content schedule` sends what is due and returns, and a line in cron or a
// launchd plist makes it periodic. That is a divergence, and it is recorded.

import { randomBytes } from "node:crypto";
import {
  channelsPath,
  duePosts,
  findChannel,
  readChannels,
  readQueue,
  writeQueue,
  type QueuedPost,
} from "../content/channels.js";
import { EXIT, UnavailableError, UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const CONTENT_SCHEMA_VERSION = 1;

export interface ContentOpts {
  readonly home: string;
  readonly channel?: string;
  readonly body?: string;
  /** ISO 8601 or a duration like `2h`. Absent means now. */
  readonly at?: string;
  readonly id?: string;
  readonly yes?: boolean;
  readonly json?: boolean;
  readonly now?: Date;
}

export interface ContentResult {
  readonly output: string;
  readonly exitCode: number;
}

/** Sends one post. Injected so a test never reaches the network. */
export type PublishFn = (webhook: string, body: string) => Promise<{ ok: boolean; status: number }>;

export function realPublish(): PublishFn {
  return async (webhook, body) => {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: body, text: body }),
    });
    return { ok: response.ok, status: response.status };
  };
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(CONTENT_SCHEMA_VERSION, kind, data);
}

const DURATION = /^(\d+(?:\.\d+)?)(m|h|d)$/;

/** `--at` accepts a timestamp or an offset; anything else is refused, not guessed. */
export function parseDue(raw: string | undefined, now: Date): string {
  if (raw === undefined) return now.toISOString();
  const relative = DURATION.exec(raw.trim());
  if (relative) {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[relative[2] as "m" | "h" | "d"];
    return new Date(now.getTime() + Number(relative[1]) * unit).toISOString();
  }
  const at = Date.parse(raw);
  if (Number.isNaN(at)) throw new UsageError(`--at must be an ISO timestamp or an offset like 2h, got ${JSON.stringify(raw)}`);
  return new Date(at).toISOString();
}

function requireBody(opts: ContentOpts): string {
  if (!opts.body) throw new UsageError("--body is required");
  return opts.body;
}

export async function runContentPublish(opts: ContentOpts, publish: PublishFn = realPublish()): Promise<ContentResult> {
  if (!opts.channel) throw new UsageError("--channel is required: av content publish --channel <name> --body <text>");
  const body = requireBody(opts);
  const channel = findChannel(opts.home, opts.channel);

  if (!opts.yes) {
    return {
      output: opts.json
        ? envelope("content.publish", { published: false, channel: channel.name, body })
        : `would publish to ${channel.name}:\n\n${body}\n\n(nothing was sent — re-run with --yes)`,
      exitCode: EXIT.ok,
    };
  }
  const result = await publish(channel.webhook, body);
  if (!result.ok) {
    // The webhook is never echoed. It is a bearer credential, and an error
    // message is exactly where one ends up pasted into a bug report.
    throw new UnavailableError(`publishing to ${channel.name} failed with HTTP ${result.status}`);
  }
  return {
    output: opts.json ? envelope("content.publish", { published: true, channel: channel.name }) : `published to ${channel.name}`,
    exitCode: EXIT.ok,
  };
}

export function runContentQueue(verb: "list" | "add" | "remove", opts: ContentOpts): ContentResult {
  const now = opts.now ?? new Date();
  const queue = readQueue(opts.home);

  if (verb === "add") {
    if (!opts.channel) throw new UsageError("--channel is required");
    findChannel(opts.home, opts.channel);
    const post: QueuedPost = {
      id: randomBytes(6).toString("hex"),
      channel: opts.channel,
      body: requireBody(opts),
      due: parseDue(opts.at, now),
      created: now.toISOString(),
      published_at: null,
    };
    writeQueue(opts.home, [...queue, post]);
    return {
      output: opts.json ? envelope("content.queue", { added: post }) : `queued ${post.id} for ${post.channel} at ${post.due}`,
      exitCode: EXIT.ok,
    };
  }

  if (verb === "remove") {
    if (!opts.id) throw new UsageError("av content queue remove needs a post id");
    const remaining = queue.filter((post) => post.id !== opts.id);
    if (remaining.length === queue.length) throw new UsageError(`no queued post with id ${JSON.stringify(opts.id)}`);
    writeQueue(opts.home, remaining);
    return {
      output: opts.json ? envelope("content.queue", { removed: opts.id }) : `removed ${opts.id}`,
      exitCode: EXIT.ok,
    };
  }

  if (opts.json) return { output: envelope("content.queue", { posts: queue }), exitCode: EXIT.ok };
  if (queue.length === 0) return { output: "content queue: empty", exitCode: EXIT.ok };
  const lines = queue.map(
    (post) => `  ${post.id}  ${post.channel.padEnd(12)} ${post.published_at ? `sent ${post.published_at}` : `due ${post.due}`}`,
  );
  return { output: ["content queue:", ...lines].join("\n"), exitCode: EXIT.ok };
}

/**
 * Send everything that is due.
 *
 * A post is marked sent immediately after its webhook returns, and the queue is
 * written after every post rather than once at the end. A crash halfway through
 * a batch then loses nothing and repeats nothing — the same ordering `watch`
 * uses, chosen for the same reason.
 */
export async function runContentSchedule(opts: ContentOpts, publish: PublishFn = realPublish()): Promise<ContentResult> {
  const now = opts.now ?? new Date();
  let queue = readQueue(opts.home);
  const due = duePosts(queue, now);

  if (!opts.yes) {
    return {
      output: opts.json
        ? envelope("content.schedule", { published: false, due: due.map((post) => post.id) })
        : due.length === 0
          ? "content schedule: nothing due"
          : `${due.length} post(s) due: ${due.map((p) => `${p.id} → ${p.channel}`).join(", ")}\n(nothing was sent — re-run with --yes)`,
      exitCode: EXIT.ok,
    };
  }

  const sent: string[] = [];
  const failed: string[] = [];
  for (const post of due) {
    const channel = findChannel(opts.home, post.channel);
    const result = await publish(channel.webhook, post.body);
    if (!result.ok) {
      // Left in the queue, so the next run retries it. Reported, not swallowed.
      failed.push(post.id);
      continue;
    }
    queue = queue.map((entry) => (entry.id === post.id ? { ...entry, published_at: new Date().toISOString() } : entry));
    writeQueue(opts.home, queue);
    sent.push(post.id);
  }

  return {
    output: opts.json
      ? envelope("content.schedule", { published: true, sent, failed })
      : `content schedule: ${sent.length} sent${failed.length > 0 ? `, ${failed.length} failed and stay queued` : ""}`,
    exitCode: failed.length > 0 ? EXIT.failed : EXIT.ok,
  };
}

/** Where a user writes their channels, for the empty-state message. */
export function describeChannels(home: string): string {
  const channels = readChannels(home);
  if (channels.length === 0) return `no channels configured — add one to ${channelsPath(home)}`;
  return `channels: ${channels.map((channel) => channel.name).join(", ")}`;
}
