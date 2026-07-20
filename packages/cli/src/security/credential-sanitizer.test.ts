import { describe, it, expect, vi, afterEach } from "vitest";
import { sanitize } from "./credential-sanitizer.js";
import { emit, setEmitTransform, resetEmitTransform } from "../cli/emit.js";

describe("sanitize — credential redaction", () => {
  it("redacts URL userinfo (self-update / fetch URLs)", () => {
    expect(sanitize("clone https://x-access-token:ghp_aaaaaaaaaaaaaaaaaaaa@github.com/x", {})).toBe(
      "clone https://••••@github.com/x",
    );
    expect(sanitize("https://user:pass@host/p", {})).toBe("https://••••@host/p");
  });

  it("redacts token-shaped patterns regardless of env", () => {
    expect(sanitize("t=ghp_abcdefghijklmnopqrst1234", {})).toContain("••••");
    expect(sanitize("t=ghp_abcdefghijklmnopqrst1234", {})).not.toContain("ghp_");
    expect(sanitize("key sk-ABCDEFGHIJKLMNOP12", {})).not.toContain("sk-ABC");
    expect(sanitize("github_pat_11ABCDEFG0abcdefghijImnop", {})).not.toContain("github_pat_11");
  });

  it("redacts modern sk-proj- keys (with underscores) and gh app/user/refresh tokens", () => {
    expect(sanitize("k=sk-proj-abcdef_GHIJKL_mnop123456", {})).not.toContain("mnop123456");
    expect(sanitize("t=ghs_abcdefghijklmnopqrst", {})).not.toContain("ghs_abcdef");
    expect(sanitize("t=ghu_abcdefghijklmnopqrst", {})).not.toContain("ghu_abcdef");
  });

  it("redacts _SECRET / _PASSWORD env classes too", () => {
    expect(sanitize("leak longsecretvalue1", { GITHUB_CLIENT_SECRET: "longsecretvalue1" })).not.toContain("longsecretvalue1");
    expect(sanitize("pw dbpassword12345", { DB_PASSWORD: "dbpassword12345" })).not.toContain("dbpassword12345");
  });

  it("redacts an env-sourced secret value wherever it appears", () => {
    const env = { GH_TOKEN: "s3cr3tValue1234" };
    expect(sanitize("update failed with s3cr3tValue1234 inside", env)).toBe(
      "update failed with •••• inside",
    );
    expect(sanitize("leak MY_API_KEY", { MY_API_KEY: "abcdef123456" })).not.toContain("abcdef123456");
  });

  it("NEVER shreds output for empty or short env values (red-team)", () => {
    expect(sanitize("perfectly normal output", { GH_TOKEN: "" })).toBe("perfectly normal output");
    expect(sanitize("perfectly normal output", { GH_TOKEN: "1" })).toBe("perfectly normal output");
    expect(sanitize("a b c", { GITHUB_TOKEN: "x" })).toBe("a b c");
  });

  it("leaves ordinary text unchanged (incl a bare @ that is not URL userinfo)", () => {
    expect(sanitize("wrote file at ./a@b/c.txt", {})).toBe("wrote file at ./a@b/c.txt");
    expect(sanitize("installed 21 skills, 13 agents", {})).toBe("installed 21 skills, 13 agents");
  });

  it("handles multiline stacks, redacting only the secret bits", () => {
    const env = { GH_TOKEN: "tok_abcdef123456" };
    const out = sanitize("Error: boom tok_abcdef123456\n  at f (a.js:1)\n  at g", env);
    expect(out).toContain("at f (a.js:1)");
    expect(out).not.toContain("tok_abcdef123456");
  });
});

describe("emit boundary wired to sanitize (the path the top-level catch missed)", () => {
  afterEach(() => {
    resetEmitTransform();
    vi.restoreAllMocks();
  });

  it("redacts a token inside a printed command summary", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    setEmitTransform(sanitize);
    emit("update failed to write: clone https://x:ghp_aaaaaaaaaaaaaaaaaaaa@github.com/r");
    const printed = String(log.mock.calls[0][0]);
    expect(printed).not.toContain("ghp_");
    expect(printed).toContain("••••");
  });
});
