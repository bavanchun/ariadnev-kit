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

import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

/**
 * The release-signing public key, base64 SPKI DER (Ed25519).
 *
 * The private half was generated outside this repository and never passed
 * through it. It lives in the maintainer's password manager plus one offline
 * copy, and signing happens locally — `finalize-release.yml` only ever
 * verifies, so CI never holds the key. That is deliberate: putting it in Actions
 * secrets would move the trust root from the maintainer to the GitHub account.
 *
 * Recovery is the installer, not this key. If it is lost, releases stop being
 * verifiable and users reinstall from `ariadnev.com`; the installers do not
 * check this signature precisely so that losing the key cannot brick anyone.
 *
 * Changing this constant re-roots trust for every installed binary. It is not
 * overridable at runtime — an override would restore the hole it closes.
 */
export const UPDATE_SIGNING_PUBLIC_KEY = "MCowBQYDK2VwAyEAXzDBIiBKNDB/DeEvyhE4G1xxCpGPCNI0Z3bEwr7J98I=";

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

/**
 * Round-trip an Ed25519 signature entirely in-process, with a throwaway key.
 *
 * `av update`'s fail-closed verification is indistinguishable, from the
 * outside, from a runtime where Ed25519 does not work at all: both refuse every
 * update. This separates them. The binary ships cross-compiled to five targets
 * from one Bun build, and whether `node:crypto` carries Ed25519 into all five is
 * an assumption nobody has tested — so `av doctor` states it, and the release
 * smoke gate reads it on every platform CI can run.
 */
export function ed25519SelfTest(): boolean {
  try {
    const pair = generateKeyPairSync("ed25519");
    const message = Buffer.from("ariadnev ed25519 self-test", "utf8");
    return verify(null, message, pair.publicKey, sign(null, message, pair.privateKey));
  } catch {
    return false;
  }
}
