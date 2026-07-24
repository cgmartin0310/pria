import crypto from "node:crypto";
import { config } from "./config.js";

/**
 * AES-256-GCM decrypt — mirror of the API's lib/crypto.ts. The worker only
 * needs to DECRYPT stored credentials/sessions using the same key.
 * (TODO: extract to a shared @pria/secrets package to avoid drift.)
 */
function getKey(): Buffer {
  const key = Buffer.from(config.encryptionKey, "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (base64)");
  return key;
}

export function decryptSecret(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Malformed encrypted value");
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64!, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}
