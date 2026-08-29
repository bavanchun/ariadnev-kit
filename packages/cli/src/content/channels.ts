// Where a post goes, and the queue of posts waiting to go there.
//
// EVERY CHANNEL IS USER-SUPPLIED. Upstream publishes to channels its vendor
// configures; ariadnev hosts nothing and brokers nothing. A channel here is a
// name and a webhook URL the user wrote into their own file, which is what
// phase 1's ADR means by mapping a remote-vendor half onto an ariadnev-owned
// equivalent: the function survives, the hosted service does not.
//
// HTTPS ONLY, AND THAT IS NOT NEGOTIABLE FROM CONFIG. A webhook URL is a bearer
// credential — anyone holding it can post as you — and sending one over plain
// HTTP hands it to every observer on the path. There is no flag to turn this
// off, because a flag would be the thing someone sets once in a script.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import { UsageError } from "../cli/exit-codes.js";
import { ensureOperationalDirectory, operationalPath } from "../storage/operational-paths.js";

const CHANNELS = "channels.json";
const QUEUE = "queue.json";

/**
 * `~/.ariadnev/operational/content` — authoritative, not derived.
 *
 * Deliberately not named after "content" alone. `operational-paths.ts` already
 * exports a helper by that name meaning something else entirely — the *derived*
 * shard root for `content-search` — and reusing it would put two different
 * things under one word. The rebuild-equivalence guard matches that identifier
 * textually, precisely because it wraps a derived path, so the collision would
 * also have registered this file as a derived-state consumer. It is not one: a
 * queued post is the only copy there is, and deleting it loses it.
 */
export function publishingRoot(home: string): string {
  return operationalPath(home, "content");
}

export function channelsPath(home: string): string {
  return join(publishingRoot(home), CHANNELS);
}

export function queuePath(home: string): string {
  return join(publishingRoot(home), QUEUE);
}

export interface Channel {
  readonly name: string;
  readonly webhook: string;
}

/**
 * The configured channels.
 *
 * A malformed entry is dropped rather than failing the whole file: one bad
 * webhook should not make the other three unusable. A malformed *file* is a
 * different matter and throws, because "no channels configured" and "your
 * config is corrupt" need different responses.
 */
export function readChannels(home: string): Channel[] {
  let raw: string;
  try {
    raw = readFileSync(channelsPath(home), "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`${channelsPath(home)} is not valid JSON: ${(error as Error).message}`);
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { channels?: unknown })?.channels;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry): entry is Channel => typeof (entry as Channel)?.name === "string" && typeof (entry as Channel)?.webhook === "string")
    .map((entry) => ({ name: entry.name, webhook: entry.webhook }));
}

export function findChannel(home: string, name: string): Channel {
  const channels = readChannels(home);
  const found = channels.find((channel) => channel.name === name);
  if (!found) {
    throw new UsageError(
      `no channel named ${JSON.stringify(name)}. ` +
        (channels.length > 0
          ? `Configured: ${channels.map((c) => c.name).join(", ")}.`
          : `Add one to ${channelsPath(home)}: [{"name":"${name}","webhook":"https://..."}]`),
    );
  }
  assertPostable(found);
  return found;
}

/** Refuse a webhook that would travel in the clear. No flag lifts this. */
export function assertPostable(channel: Channel): void {
  let parsed: URL;
  try {
    parsed = new URL(channel.webhook);
  } catch {
    throw new UsageError(`channel ${JSON.stringify(channel.name)} has a webhook that is not a URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new UsageError(
      `channel ${JSON.stringify(channel.name)} uses ${parsed.protocol}//. A webhook URL is a bearer credential, ` +
        `so ariadnev sends it over https only.`,
    );
  }
}

export interface QueuedPost {
  readonly id: string;
  readonly channel: string;
  readonly body: string;
  /** ISO 8601. Nothing is sent before this. */
  readonly due: string;
  readonly created: string;
  readonly published_at: string | null;
}

export function readQueue(home: string): QueuedPost[] {
  try {
    const parsed = JSON.parse(readFileSync(queuePath(home), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is QueuedPost => typeof (entry as QueuedPost)?.id === "string");
  } catch {
    return [];
  }
}

export function writeQueue(home: string, posts: readonly QueuedPost[]): void {
  ensureOperationalDirectory(home, publishingRoot(home));
  atomicWritePrivate(queuePath(home), `${JSON.stringify(posts, null, 2)}\n`);
}

/** The posts whose time has come and which have not been sent. */
export function duePosts(posts: readonly QueuedPost[], now: Date): QueuedPost[] {
  return posts.filter((post) => post.published_at === null && Date.parse(post.due) <= now.getTime());
}
