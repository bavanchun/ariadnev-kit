import assert from "node:assert/strict";
import test from "node:test";
import { requireCiVerdict } from "./require-ci-verdict.mjs";

const SHA = "a".repeat(40);
const CHECK = "Lint · Build · Test";

/** A fake GitHub API that answers the check-runs query from a scripted list. */
function fakeApi(pages) {
  const calls = [];
  let index = 0;
  return {
    calls,
    fetchCheckRuns: async (path) => {
      calls.push(path);
      const page = pages[Math.min(index, pages.length - 1)];
      index += 1;
      if (page instanceof Error) throw page;
      return page;
    },
  };
}

const run = (overrides) => ({
  name: CHECK,
  status: "completed",
  conclusion: "success",
  head_sha: SHA,
  html_url: "https://example.invalid/run",
  ...overrides,
});

test("accepts a completed, successful check on the exact SHA", async () => {
  const api = fakeApi([{ check_runs: [run()] }]);
  const verdict = await requireCiVerdict({ repo: "o/r", sha: SHA, checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns, waitMs: 0, sleep: async () => {} });
  assert.equal(verdict.conclusion, "success");
  assert.match(api.calls[0], /repos\/o\/r\/commits\/a{40}\/check-runs\?check_name=Lint%20%C2%B7%20Build%20%C2%B7%20Test/);
});

test("a skipped check is not a verdict — a release must never ride on a docs-only run", async () => {
  const api = fakeApi([{ check_runs: [run({ conclusion: "skipped" })] }]);
  await assert.rejects(
    requireCiVerdict({ repo: "o/r", sha: SHA, checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns, waitMs: 0, sleep: async () => {} }),
    /concluded "skipped"/,
  );
});

test("a failed check refuses the cut and names the run", async () => {
  const api = fakeApi([{ check_runs: [run({ conclusion: "failure" })] }]);
  await assert.rejects(
    requireCiVerdict({ repo: "o/r", sha: SHA, checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns, waitMs: 0, sleep: async () => {} }),
    /concluded "failure".*example\.invalid/s,
  );
});

test("no check run for the SHA fails closed", async () => {
  const api = fakeApi([{ check_runs: [] }]);
  await assert.rejects(
    requireCiVerdict({ repo: "o/r", sha: SHA, checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns, waitMs: 0, sleep: async () => {} }),
    /no "Lint · Build · Test" check run/,
  );
});

test("waits while the check is in progress, then reads the newest completed run", async () => {
  // GitHub evaluates the newest check run per name; a re-run creates a second
  // record. The newest one carries the verdict, and the loop must stop
  // polling the moment it completes.
  const api = fakeApi([
    { check_runs: [run({ status: "in_progress", conclusion: null })] },
    { check_runs: [run({ status: "in_progress", conclusion: null })] },
    { check_runs: [run({ conclusion: "failure", started_at: "2026-08-23T01:00:00Z" }), run({ started_at: "2026-08-23T02:00:00Z" })] },
  ]);
  const slept = [];
  const verdict = await requireCiVerdict({
    repo: "o/r", sha: SHA, checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns,
    waitMs: 10_000, pollMs: 1_000, sleep: async (ms) => { slept.push(ms); },
  });
  assert.equal(verdict.conclusion, "success");
  assert.equal(api.calls.length, 3);
  assert.deepEqual(slept, [1_000, 1_000]);
});

test("gives up after the wait budget with the last observed state", async () => {
  const api = fakeApi([{ check_runs: [run({ status: "queued", conclusion: null })] }]);
  let clock = 0;
  await assert.rejects(
    requireCiVerdict({
      repo: "o/r", sha: SHA, checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns,
      waitMs: 3_000, pollMs: 1_000, sleep: async (ms) => { clock += ms; }, now: () => clock,
    }),
    /still "queued" after 3s/,
  );
});

test("rejects a malformed SHA before touching the API", async () => {
  const api = fakeApi([{ check_runs: [run()] }]);
  await assert.rejects(
    requireCiVerdict({ repo: "o/r", sha: "main", checkName: CHECK, fetchCheckRuns: api.fetchCheckRuns, waitMs: 0, sleep: async () => {} }),
    /full 40-hex commit SHA/,
  );
  assert.equal(api.calls.length, 0);
});
