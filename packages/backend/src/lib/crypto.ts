import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Authenticated symmetric encryption for credentials at rest (AES-256-GCM).
 *
 * Used for anything sensitive we must store and later use verbatim — portal
 * logins especially, since those unlock PHI systems. The key comes from
 * CREDENTIAL_ENCRYPTION_KEY (base64, 32 bytes). Rotating the key requires
 * re-encrypting existing values, so treat it as long-lived.
 *
 * Wire format (all base64, joined by ':'):  v1:<iv>:<authTag>:<ciphertext>
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length

function getKey(): Buffer {
  const raw = config.encryptionKey;
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set — cannot encrypt/decrypt stored credentials"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (base64) — got ${key.length}`
    );
  }
  return key;
}

/** True when a key is configured, so callers can degrade gracefully. */
export function encryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a UTF-8 string. Returns a self-describing token. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a token produced by encryptSecret. Throws on tampering/format. */
export function decryptSecret(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed encrypted credential");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64!, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64!, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Heuristic: does this look like one of our encrypted tokens? */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
