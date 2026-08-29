import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GhRunner } from "../github/gh.js";
import { channelsPath, queuePath, readChannels, readQueue } from "../content/channels.js";
import { runChangelog, selectReleases, type ReleaseEntry } from "./changelog-command.js";
import { parseDue, runContentPublish, runContentQueue, runContentSchedule, type PublishFn } from "./content-command.js";
import { EXIT, UnavailableError, UsageError } from "./exit-codes.js";
import { renderFeedback, runFeedback, parseType } from "./feedback-command.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-vendor-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function withChannels(home: string, channels: unknown): string {
  const path = channelsPath(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(channels));
  return home;
}

const HTTPS = [{ name: "discord", webhook: "https://example.invalid/hook" }];

function recorder(ok = true): { publish: PublishFn; sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    publish: (webhook, body) => {
      sent.push(`${webhook} ${body}`);
      return Promise.resolve({ ok, status: ok ? 204 : 500 });
    },
  };
}

describe("content channels", () => {
  it("refuses a webhook that would travel in the clear", async () => {
    // A webhook URL is a bearer credential. There is deliberately no flag that
    // turns this off, because a flag is the thing someone sets once in a script.
    const home = withChannels(mk(), [{ name: "plain", webhook: "http://example.invalid/hook" }]);
    await expect(runContentPublish({ home, channel: "plain", body: "hi", yes: true })).rejects.toThrow(/https only/);
  });

  it("names the channels that do exist when one does not", () => {
    const home = withChannels(mk(), HTTPS);
    expect(() => runContentQueue("add", { home, channel: "slack", body: "x" })).toThrow(/Configured: discord/);
  });

  it("points at the file to create when nothing is configured", () => {
    const home = mk();
    expect(() => runContentQueue("add", { home, channel: "discord", body: "x" })).toThrow(/channels\.json/);
  });

  it("reports a corrupt channels file rather than reading it as empty", () => {
    // "No channels" and "your config is broken" need different responses.
    const home = mk();
    mkdirSync(dirname(channelsPath(home)), { recursive: true });
    writeFileSync(channelsPath(home), "{ broken");
    // Reached through any path that resolves a channel; `queue list` reads only
    // the queue, so it is deliberately not the one asserted here.
    expect(() => readChannels(home)).toThrow(UsageError);
    expect(() => runContentQueue("add", { home, channel: "discord", body: "x" })).toThrow(UsageError);
  });
});

describe("av content publish", () => {
  it("previews and sends nothing without --yes", async () => {
    const home = withChannels(mk(), HTTPS);
    const world = recorder();
    const result = await runContentPublish({ home, channel: "discord", body: "hello" }, world.publish);
    expect(world.sent).toEqual([]);
    expect(result.output).toMatch(/nothing was sent/);
  });

  it("sends with --yes", async () => {
    const home = withChannels(mk(), HTTPS);
    const world = recorder();
    const result = await runContentPublish({ home, channel: "discord", body: "hello", yes: true }, world.publish);
    expect(world.sent).toEqual(["https://example.invalid/hook hello"]);
    expect(result.exitCode).toBe(EXIT.ok);
  });

  it("never echoes the webhook in a failure message", async () => {
    // An error message is exactly where a credential ends up pasted into a bug
    // report.
    const home = withChannels(mk(), HTTPS);
    const world = recorder(false);
    await expect(runContentPublish({ home, channel: "discord", body: "x", yes: true }, world.publish)).rejects.toThrow(UnavailableError);
    await expect(runContentPublish({ home, channel: "discord", body: "x", yes: true }, world.publish)).rejects.toThrow(
      /^(?!.*example\.invalid).*HTTP 500/s,
    );
  });
});

describe("av content queue", () => {
  const now = new Date("2026-08-29T10:00:00.000Z");

  it("queues a post and lists it", () => {
    const home = withChannels(mk(), HTTPS);
    runContentQueue("add", { home, channel: "discord", body: "later", at: "2h", now });
    const queued = readQueue(home);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.due).toBe("2026-08-29T12:00:00.000Z");
    expect(runContentQueue("list", { home }).output).toMatch(/discord/);
  });

  it("removes by id, and says so when the id is unknown", () => {
    const home = withChannels(mk(), HTTPS);
    runContentQueue("add", { home, channel: "discord", body: "x", now });
    const id = readQueue(home)[0]!.id;
    runContentQueue("remove", { home, id });
    expect(readQueue(home)).toEqual([]);
    expect(() => runContentQueue("remove", { home, id: "nope" })).toThrow(/no queued post/);
  });

  it.each(["tomorrow", "2 hours", ""])("refuses --at %s rather than guessing", (raw) => {
    expect(() => parseDue(raw, now)).toThrow(UsageError);
  });

  it("accepts an ISO timestamp as well as an offset", () => {
    expect(parseDue("2026-09-01T00:00:00Z", now)).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("av content schedule", () => {
  const now = new Date("2026-08-29T12:00:00.000Z");

  it("previews what is due and sends nothing", async () => {
    const home = withChannels(mk(), HTTPS);
    runContentQueue("add", { home, channel: "discord", body: "due", now: new Date("2026-08-29T10:00:00Z") });
    const world = recorder();
    const result = await runContentSchedule({ home, now }, world.publish);
    expect(world.sent).toEqual([]);
    expect(result.output).toMatch(/1 post\(s\) due/);
  });

  it("sends only what is due, and marks each one immediately", async () => {
    const home = withChannels(mk(), HTTPS);
    runContentQueue("add", { home, channel: "discord", body: "due", now: new Date("2026-08-29T10:00:00Z") });
    runContentQueue("add", { home, channel: "discord", body: "later", at: "2026-08-30T00:00:00Z", now });
    const world = recorder();
    await runContentSchedule({ home, now, yes: true }, world.publish);
    expect(world.sent).toEqual(["https://example.invalid/hook due"]);
    const queue = readQueue(home);
    expect(queue.find((p) => p.body === "due")?.published_at).toBeTruthy();
    expect(queue.find((p) => p.body === "later")?.published_at).toBeNull();
  });

  it("leaves a failed post queued so the next run retries it", async () => {
    const home = withChannels(mk(), HTTPS);
    runContentQueue("add", { home, channel: "discord", body: "due", now: new Date("2026-08-29T10:00:00Z") });
    const result = await runContentSchedule({ home, now, yes: true }, recorder(false).publish);
    expect(result.exitCode).toBe(EXIT.failed);
    expect(readQueue(home)[0]?.published_at).toBeNull();
  });

  it("writes the queue after each post, not once at the end", async () => {
    // A crash halfway through a batch must lose nothing and repeat nothing.
    const home = withChannels(mk(), HTTPS);
    for (const body of ["a", "b"]) {
      runContentQueue("add", { home, channel: "discord", body, now: new Date("2026-08-29T10:00:00Z") });
    }
    let seenAfterFirst = 0;
    const publish: PublishFn = () => {
      seenAfterFirst = readQueue(home).filter((p) => p.published_at !== null).length;
      return Promise.resolve({ ok: true, status: 204 });
    };
    await runContentSchedule({ home, now, yes: true }, publish);
    // On the second call, the first was already recorded as sent.
    expect(seenAfterFirst).toBe(1);
    expect(readFileSync(queuePath(home), "utf8")).toContain("published_at");
  });
});

describe("av feedback", () => {
  const base = { home: "/h", cwd: "/c", type: "bug", title: "Update failed" };

  it("refuses an unknown type instead of inventing a label", () => {
    expect(() => parseType("wishlist")).toThrow(UsageError);
    expect(() => parseType(undefined)).toThrow(/--type is required/);
  });

  it("redacts what a person typed, not only the diagnostics", () => {
    // A body pasted from a terminal carries whatever was on that terminal, and
    // this text is on its way to a public issue.
    const markdown = renderFeedback(
      { ...base, body: "it printed ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa and died" },
      "bug",
      null,
    );
    expect(markdown).not.toContain("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("prints the report when no destination is named", () => {
    const result = runFeedback({ ...base, body: "details" });
    expect(result.output).toContain("# Update failed");
    expect(result.output).toContain("- type: bug");
  });

  it("writes the file with --export", () => {
    const home = mk();
    const path = join(home, "feedback.md");
    runFeedback({ ...base, home, cwd: home, body: "details", export: path });
    expect(readFileSync(path, "utf8")).toContain("# Update failed");
  });

  it("previews rather than submitting without --yes", () => {
    const calls: string[][] = [];
    const gh: GhRunner = (args) => (calls.push([...args]), { status: 0, stdout: "", stderr: "" });
    const result = runFeedback({ ...base, submit: true, body: "d" }, gh);
    expect(calls).toEqual([]);
    expect(result.output).toMatch(/Re-run with --yes/);
  });

  it("opens the issue with --submit --yes, and reports the URL", () => {
    const gh: GhRunner = () => ({ status: 0, stdout: "https://github.com/o/r/issues/1\n", stderr: "" });
    const result = runFeedback({ ...base, submit: true, yes: true, body: "d" }, gh);
    expect(result.output).toMatch(/feedback submitted — https:\/\/github\.com\/o\/r\/issues\/1/);
  });

  it("reports a gh failure rather than claiming it submitted", () => {
    const gh: GhRunner = () => ({ status: 1, stdout: "", stderr: "not authenticated" });
    const result = runFeedback({ ...base, submit: true, yes: true, body: "d" }, gh);
    expect(result.exitCode).toBe(EXIT.failed);
    expect(result.output).toMatch(/not authenticated/);
  });
});

describe("av changelog", () => {
  const releases: ReleaseEntry[] = [
    { version: "1.3.0", tag: "ariadnev@1.3.0", published_at: "2026-08-29T00:00:00Z", prerelease: false, body: "" },
    { version: "1.2.1-beta.0", tag: "ariadnev@1.2.1-beta.0", published_at: "2026-08-20T00:00:00Z", prerelease: true, body: "" },
    { version: "1.2.0", tag: "ariadnev@1.2.0", published_at: "2026-08-01T00:00:00Z", prerelease: false, body: "" },
  ];

  it("compares versions numerically, not as strings", () => {
    // A string compare sorts 0.10.0 below 0.9.0, which is how a user stops being
    // offered updates.
    const wide = [{ ...releases[0]!, version: "0.10.0" }, { ...releases[0]!, version: "0.9.0" }];
    expect(selectReleases(wide, { from: "0.9.0" }, "0.9.0").map((r) => r.version)).toEqual(["0.10.0"]);
  });

  it("--since-current shows only what is newer than the running binary", () => {
    expect(selectReleases(releases, { sinceCurrent: true }, "1.2.0").map((r) => r.version)).toEqual(["1.3.0", "1.2.1-beta.0"]);
  });

  it("shows everything when neither filter is given", () => {
    expect(selectReleases(releases, {}, "1.2.0")).toHaveLength(3);
  });

  it("refuses a --from that is not a version", () => {
    expect(() => selectReleases(releases, { from: "latest" }, "1.2.0")).toThrow(UsageError);
  });

  it("says so plainly when the running version is the newest", () => {
    const gh: GhRunner = () => ({ status: 0, stdout: JSON.stringify([{ tagName: "ariadnev@1.2.0" }]), stderr: "" });
    const result = runChangelog({ sinceCurrent: true, currentVersion: "1.2.0" }, gh);
    expect(result.output).toMatch(/1\.2\.0 is the newest release/);
  });

  it("coerces every field, so a missing date never prints as undefined", () => {
    const gh: GhRunner = () => ({ status: 0, stdout: JSON.stringify([{ tagName: "ariadnev@1.3.0" }]), stderr: "" });
    const parsed = JSON.parse(runChangelog({ json: true, currentVersion: "1.2.0" }, gh).output);
    expect(parsed.data.releases[0]).toMatchObject({ version: "1.3.0", published_at: null, prerelease: false });
  });

  it("does not print GitHub's zero date as though it were a real one", () => {
    // Found on the binary: `gh` returns 0001-01-01T00:00:00Z for a release that
    // was never published, and it rendered as `0001-01-01` — the same
    // recognise-it-as-a-sentinel shape phase 11 rejected for `api status`.
    const gh: GhRunner = () => ({
      status: 0,
      stdout: JSON.stringify([{ tagName: "ariadnev@1.2.0", publishedAt: "0001-01-01T00:00:00Z" }]),
      stderr: "",
    });
    expect(JSON.parse(runChangelog({ json: true, currentVersion: "1.1.0" }, gh).output).data.releases[0].published_at).toBeNull();
    expect(runChangelog({ currentVersion: "1.1.0" }, gh).output).toContain("unpublished");
    expect(runChangelog({ currentVersion: "1.1.0" }, gh).output).not.toContain("0001-01-01");
  });

  it("reports a gh failure rather than an empty changelog", () => {
    const gh: GhRunner = () => ({ status: 1, stdout: "", stderr: "no auth" });
    expect(() => runChangelog({ currentVersion: "1.2.0" }, gh)).toThrow(UnavailableError);
  });
});
