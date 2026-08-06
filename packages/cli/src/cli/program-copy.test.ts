import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("program positioning", () => {
  it("describes the distributed kit without a universal author-once claim", () => {
    const help = buildProgram().helpInformation();
    expect(help).toContain("Install a curated, quality-gated workflow kit");
    expect(help).not.toContain("Author agent skills once");
  });

  it("uses the same bounded positioning in the no-args banner", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await buildProgram().parseAsync(["node", "vcskill"]);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("curated workflows, quality-gated across coding agents");
    expect(output).not.toContain("install to any provider");
  });
});
