import crypto from "node:crypto";

/**
 * RFC 6238 TOTP (and RFC 4226 HOTP) — generates the same codes an authenticator
 * app produces from a shared base32 seed. Used so the Portal Worker can complete
 * an authenticator-app MFA challenge unattended, and so the UI can verify a
 * stored seed is correct before we rely on it.
 *
 * Verified against the RFC 6238 SHA-1 test vector.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode an RFC 4648 base32 string (case-insensitive, ignores spaces/padding). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // skip anything not in the alphabet
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Generate a TOTP code from a base32 seed.
 * Defaults: 6 digits, 30s period, SHA-1 — what Google Authenticator uses.
 */
export function totp(
  seed: string,
  opts?: { digits?: number; period?: number; timestamp?: number }
): string {
  const digits = opts?.digits ?? 6;
  const period = opts?.period ?? 30;
  const now = opts?.timestamp ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / period);

  const key = base32Decode(seed);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** Seconds until the current code rolls over — for UI countdowns. */
export function totpSecondsRemaining(period = 30, timestamp?: number): number {
  const now = timestamp ?? Math.floor(Date.now() / 1000);
  return period - (now % period);
}

/** Cheap sanity check that a string could be a base32 seed. */
export function looksLikeBase32(seed: string): boolean {
  const clean = seed.replace(/\s+/g, "").toUpperCase();
  return clean.length >= 8 && /^[A-Z2-7]+=*$/.test(clean);
}
