import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sweepOnce, type SweepOptions } from "./pass.js";
import type { IssueRef } from "./respond.js";
import { parseRepo, readState } from "./state.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-watch-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ref = parseRepo("octo/repo");

const issue = (number: number): IssueRef => ({
  number,
  title: `issue ${number}`,
  body: "please help",
  author: "stranger",
  url: `https://github.com/octo/repo/issues/${number}`,
});

function options(home: string, over: Partial<SweepOptions> = {}): SweepOptions {
  return {
    home,
    ref,
    issues: [issue(1)],
    skillRef: "kit/skill",
    maxPerHour: 3,
    posting: false,
    dispatch: () => Promise.resolve({ ok: true, output: "a draft reply" }),
    now: () => new Date("2026-08-29T10:00:00.000Z"),
    ...over,
  };
}

describe("a preview cannot post", () => {
  it("drafts without posting when no post function is supplied", async () => {
    const home = mk();
    const result = await sweepOnce(options(home));
    expect(result.posting).toBe(false);
    expect(result.results[0]).toMatchObject({ disposition: "drafted", draft: "a draft reply" });
  });

  it("still cannot post even if `posting` is somehow true with no post function", async () => {
    // The capability, not the flag, is what makes a preview safe. A future
    // branch that sets `posting` and forgets the function has nothing to call.
    const home = mk();
    const result = await sweepOnce(options(home, { posting: true }));
    expect(result.results[0]?.disposition).toBe("drafted");
  });

  it("posts exactly once per issue when it is given the capability", async () => {
    const home = mk();
    const posted: number[] = [];
    const result = await sweepOnce(options(home, { posting: true, post: (n) => posted.push(n) }));
    expect(posted).toEqual([1]);
    expect(result.results[0]?.disposition).toBe("answered");
  });
});

describe("no duplicate response, including across a crash", () => {
  it("never answers an issue that is already in the answered set", async () => {
    const home = mk();
    const posted: number[] = [];
    const opts = options(home, { posting: true, post: (n) => posted.push(n) });
    await sweepOnce(opts);
    await sweepOnce(opts);
    expect(posted).toEqual([1]);
  });

  it("loses a reply rather than duplicating one when it crashes mid-dispatch", async () => {
    // THE CASE THAT DECIDES THE ORDERING. The issue is claimed before the agent
    // runs, so a crash between the two costs a reply. Claiming afterwards would
    // cost a duplicate — a second comment on a public repository, under the
    // maintainer's name.
    const home = mk();
    const posted: number[] = [];

    await expect(
      sweepOnce(
        options(home, {
          posting: true,
          post: (n) => posted.push(n),
          dispatch: () => Promise.reject(new Error("process died mid-dispatch")),
        }),
      ),
    ).rejects.toThrow(/died mid-dispatch/);

    // The claim survived the crash…
    expect(readState(home, ref).responded).toEqual([1]);
    // …so the restart skips it rather than answering twice.
    const after = await sweepOnce(options(home, { posting: true, post: (n) => posted.push(n) }));
    expect(posted).toEqual([]);
    expect(after.results[0]?.disposition).toBe("already-answered");
  });

  it("does not mark an issue answered when the rate limit refused it", async () => {
    // A refusal must be retryable. Claiming before the rate check would burn the
    // issue permanently for a reason that expires in an hour.
    const home = mk();
    const result = await sweepOnce(options(home, { maxPerHour: 0 }));
    expect(result.results[0]?.disposition).toBe("rate-limited");
    expect(readState(home, ref).responded).toEqual([]);
  });
});

describe("the local rate limit", () => {
  it("stops dispatching once the hourly budget is spent", async () => {
    const home = mk();
    const dispatched: string[] = [];
    const result = await sweepOnce(
      options(home, {
        issues: [issue(1), issue(2), issue(3), issue(4)],
        maxPerHour: 2,
        dispatch: (prompt) => {
          dispatched.push(prompt);
          return Promise.resolve({ ok: true, output: "ok" });
        },
      }),
    );
    // Two dispatched, two refused — and the refusals are named, not silent.
    expect(dispatched).toHaveLength(2);
    expect(result.results.map((r) => r.disposition)).toEqual(["drafted", "drafted", "rate-limited", "rate-limited"]);
  });

  it("checks the budget before anything is spawned", async () => {
    const home = mk();
    let spawned = false;
    await sweepOnce(options(home, { maxPerHour: 0, dispatch: () => ((spawned = true), Promise.resolve({ ok: true, output: "" })) }));
    expect(spawned).toBe(false);
  });
});

describe("what the sweep records", () => {
  it("gives each issue its own nonce", async () => {
    const home = mk();
    const result = await sweepOnce(options(home, { issues: [issue(1), issue(2)] }));
    const [first, second] = result.results;
    expect(first?.nonce).toBeTruthy();
    expect(first?.nonce).not.toBe(second?.nonce);
  });

  it("advances the last-seen marker even for issues it did not answer", async () => {
    const home = mk();
    await sweepOnce(options(home, { issues: [issue(9)], maxPerHour: 0 }));
    expect(readState(home, ref).lastSeenIssue).toBe(9);
  });

  it("reports a failed dispatch instead of pretending it answered", async () => {
    const home = mk();
    const result = await sweepOnce(
      options(home, { posting: true, post: () => undefined, dispatch: () => Promise.resolve({ ok: false, output: "" }) }),
    );
    expect(result.results[0]?.disposition).toBe("dispatch-failed");
  });

  it("never prunes the answered set, only the rate-limit timestamps", async () => {
    // The answered set is the dedup guarantee. Ageing entries out of it would
    // make a months-old issue answerable again.
    const home = mk();
    await sweepOnce(options(home, { posting: true, post: () => undefined }));
    const later = new Date("2026-08-30T10:00:00.000Z");
    await sweepOnce(options(home, { issues: [issue(2)], now: () => later, posting: true, post: () => undefined }));
    const state = readState(home, ref);
    expect(state.responded).toEqual([1, 2]);
    expect(state.responseTimes).toHaveLength(1);
  });
});
