import { describe, it, expect } from "vitest";
import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { verifyChecksums, signedMessage, UPDATE_SIGNING_PUBLIC_KEY } from "./update-signature.js";

/** A throwaway release key. The real one never appears in the repo. */
function keyPair(): { publicKey: string; signer: KeyObject } {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    signer: pair.privateKey,
  };
}

const CHECKSUMS = [
  "1111111111111111111111111111111111111111111111111111111111111111  ariadnev-linux-x64",
  "2222222222222222222222222222222222222222222222222222222222222222  ariadnev-darwin-arm64",
  "",
].join("\n");

const signFor = (signer: KeyObject, tag: string, checksums: string): string =>
  sign(null, signedMessage(tag, checksums), signer).toString("base64");

describe("verifyChecksums", () => {
  it("accepts a signature the release key made over this tag and these checksums", () => {
    const { publicKey, signer } = keyPair();
    const signature = signFor(signer, "1.4.0", CHECKSUMS);
    expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature, publicKey })).toBe(true);
  });

  it("rejects a signature by a different key", () => {
    const { publicKey } = keyPair();
    const other = keyPair();
    const signature = signFor(other.signer, "1.4.0", CHECKSUMS);
    expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature, publicKey })).toBe(false);
  });

  it("rejects checksums altered after signing", () => {
    const { publicKey, signer } = keyPair();
    const signature = signFor(signer, "1.4.0", CHECKSUMS);
    const tampered = CHECKSUMS.replace(/^1{64}/, "3".repeat(64));
    expect(verifyChecksums({ tag: "1.4.0", checksums: tampered, signature, publicKey })).toBe(false);
  });

  /**
   * The replay this exists to stop. `/version` is unsigned, so an attacker who
   * can answer for the origin advertises 1.4.0 and serves the genuinely signed
   * 1.2.0 pair. Every byte is authentic; only the claim about which release it
   * is has changed. Without the tag in the signed message this verifies.
   */
  it("rejects a genuinely signed older release replayed as a newer one", () => {
    const { publicKey, signer } = keyPair();
    const oldSignature = signFor(signer, "1.2.0", CHECKSUMS);
    expect(verifyChecksums({ tag: "1.2.0", checksums: CHECKSUMS, signature: oldSignature, publicKey })).toBe(true);
    expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature: oldSignature, publicKey })).toBe(false);
  });

  // Whitespace is inside the signed bytes, so `checksums.txt` has to be
  // verified exactly as downloaded. A caller that trims it first would be
  // verifying something the signer never signed.
  it("rejects checksums whose trailing newline was stripped", () => {
    const { publicKey, signer } = keyPair();
    const signature = signFor(signer, "1.4.0", CHECKSUMS);
    expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS.trimEnd(), signature, publicKey })).toBe(false);
  });

  for (const [label, signature] of [
    ["empty", ""],
    ["not base64", "%%%%"],
    ["right length, wrong bytes", "A".repeat(88)],
  ] as const) {
    it(`rejects a ${label} signature`, () => {
      const { publicKey } = keyPair();
      expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature, publicKey })).toBe(false);
    });
  }

  for (const [label, publicKey] of [
    ["truncated", keyPair().publicKey.slice(0, 20)],
    ["not base64", "%%%%"],
  ] as const) {
    it(`rejects a ${label} public key instead of throwing`, () => {
      const { signer } = keyPair();
      const signature = signFor(signer, "1.4.0", CHECKSUMS);
      expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature, publicKey })).toBe(false);
    });
  }

  it("rejects a well-formed key of the wrong algorithm", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicKey = rsa.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const { signer } = keyPair();
    const signature = signFor(signer, "1.4.0", CHECKSUMS);
    expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature, publicKey })).toBe(false);
  });

  // The compiled-in key is the trust root for every installed binary. These
  // assert what it is, not merely that it works: a well-formed key of the wrong
  // algorithm, or a silently emptied constant, would both leave verification
  // "passing" its other tests while protecting nothing.
  it("ships a real Ed25519 key compiled in", () => {
    expect(UPDATE_SIGNING_PUBLIC_KEY).not.toBe("");
    const key = createPublicKey({
      key: Buffer.from(UPDATE_SIGNING_PUBLIC_KEY, "base64"),
      format: "der",
      type: "spki",
    });
    expect(key.asymmetricKeyType).toBe("ed25519");
    // Exact bytes, so a re-keying is a deliberate edit to a stated value rather
    // than a diff someone skims past.
    expect(key.export({ type: "spki", format: "der" }).toString("base64")).toBe(UPDATE_SIGNING_PUBLIC_KEY);
  });

  it("rejects a signature by any key that is not the release key", () => {
    const { signer } = keyPair();
    const signature = signFor(signer, "1.4.0", CHECKSUMS);
    expect(verifyChecksums({ tag: "1.4.0", checksums: CHECKSUMS, signature })).toBe(false);
  });
});

describe("signedMessage", () => {
  it("puts the tag before the checksums, separated by one newline", () => {
    expect(signedMessage("1.4.0", "a  b\n").toString("utf8")).toBe("1.4.0\na  b\n");
  });

  // Two different (tag, checksums) pairs must never produce the same bytes, or
  // one signature would authenticate both.
  it("cannot be confused by moving the boundary", () => {
    expect(signedMessage("1.4", "0\nx").equals(signedMessage("1.4.0", "x"))).toBe(false);
  });
});
