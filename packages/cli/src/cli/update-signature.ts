// Ed25519 verification for the update channel.
//
// `av update` fetches the binary and `checksums.txt` from the same origin, so
// the checksum authenticates nothing on its own: anyone who can answer for that
// origin answers for both halves of the comparison. That is the same shape as
// the installer hole closed in phase 0, except here it would run inside a tool
// that executes shell commands on the user's behalf.
//
// A detached signature over the checksums, verified against a key compiled into
// the binary, is what makes the checksum mean something. The key is the trust
// root and is deliberately not overridable — an override would restore exactly
// the hole this closes.
//
// Pure: no fs, no network. Callers supply bytes.

import { createPublicKey, verify } from "node:crypto";

/**
 * The release-signing public key, base64 SPKI DER.
 *
 * Empty until the key pair is generated. Every verification fails while it is
 * empty, which is the safe direction — an unsigned channel that reports itself
 * as unverifiable beats one that quietly trusts whatever it is handed.
 */
export const UPDATE_SIGNING_PUBLIC_KEY = "";

/**
 * The bytes the signature covers: the release tag, a newline, then
 * `checksums.txt` verbatim.
 *
 * The tag is in the signed message rather than inside `checksums.txt` because
 * `finalize-release.yml` parses that file line-by-line against
 * `^([a-f0-9]{64})  (name)$` and asserts it lists exactly the release's assets.
 * A version line would fail that assertion. Composing the message here binds
 * the version without touching a format three other things already depend on.
 *
 * Binding the version at all is what stops a replay: `/version` is unsigned, so
 * an attacker who can answer for the origin could advertise a new version while
 * serving an older, *legitimately signed* pair. The signature would verify and
 * an old binary would install. With the tag inside the signed bytes, a
 * signature made for 1.2.0 cannot authenticate a download claiming to be 1.3.0.
 */
export function signedMessage(tag: string, checksums: string): Buffer {
  return Buffer.from(`${tag}\n${checksums}`, "utf8");
}

export interface VerifyChecksumsInput {
  /** Exact release tag the caller asked for, e.g. "1.4.0". */
  tag: string;
  /** `checksums.txt` exactly as downloaded — byte-for-byte, no trimming. */
  checksums: string;
  /** Detached signature, base64, as served at `checksums.txt.sig`. */
  signature: string;
  /** Base64 SPKI DER. Defaults to the compiled-in key. */
  publicKey?: string;
}

/**
 * True only when `signature` is a valid Ed25519 signature by the release key
 * over `signedMessage(tag, checksums)`.
 *
 * Never throws. Malformed base64, a truncated key, a signature of the wrong
 * length and a genuine mismatch are all the same answer to the caller — false —
 * because there is exactly one safe response to any of them, and distinguishing
 * them in a return type invites a caller to treat some as recoverable.
 */
export function verifyChecksums(input: VerifyChecksumsInput): boolean {
  const encoded = input.publicKey ?? UPDATE_SIGNING_PUBLIC_KEY;
  if (encoded.length === 0) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verify(null, signedMessage(input.tag, input.checksums), key, Buffer.from(input.signature, "base64"));
  } catch {
    return false;
  }
}
