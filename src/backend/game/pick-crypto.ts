/** AES-256-GCM envelope for private picks and Dealer reports. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedPrivateRecord {
  keyId: string;
  ivBase64: string;
  authTagBase64: string;
  ciphertextBase64: string;
  aadHash: string;
}

export interface PickKeyring {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

function aad(input: { tableId: string; principalId: string; kind: string }): Buffer {
  return Buffer.from(`KOVA_PRIVATE_V1\n${input.tableId}\n${input.principalId}\n${input.kind}`, "utf8");
}

function requireKey(keyring: PickKeyring, keyId: string): Buffer {
  const key = keyring.keys.get(keyId);
  if (!key || key.length !== 32) throw new Error(`Private record key is unavailable: ${keyId}`);
  return key;
}

export function encryptPrivateJson(value: unknown, context: { tableId: string; principalId: string; kind: string }, keyring: PickKeyring): EncryptedPrivateRecord {
  const key = requireKey(keyring, keyring.activeKeyId);
  const iv = randomBytes(12);
  const authenticatedData = aad(context);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(authenticatedData);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    keyId: keyring.activeKeyId,
    ivBase64: iv.toString("base64"),
    authTagBase64: cipher.getAuthTag().toString("base64"),
    ciphertextBase64: ciphertext.toString("base64"),
    aadHash: createHash("sha256").update(authenticatedData).digest("hex"),
  };
}

export function decryptPrivateJson<T>(record: EncryptedPrivateRecord, context: { tableId: string; principalId: string; kind: string }, keyring: PickKeyring): T {
  const authenticatedData = aad(context);
  const expectedHash = createHash("sha256").update(authenticatedData).digest("hex");
  if (record.aadHash !== expectedHash) throw new Error("Private record context does not match.");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(keyring, record.keyId), Buffer.from(record.ivBase64, "base64"));
  decipher.setAAD(authenticatedData);
  decipher.setAuthTag(Buffer.from(record.authTagBase64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertextBase64, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function parsePickKeyring(activeKeyId: string, activeKeyBase64: string, previous = ""): PickKeyring {
  const entries = [[activeKeyId, activeKeyBase64] as const];
  for (const item of previous.split(",").map((value) => value.trim()).filter(Boolean)) {
    const separator = item.indexOf(":");
    if (separator < 1) throw new Error("Previous encryption keys must use key-id:base64 format.");
    entries.push([item.slice(0, separator), item.slice(separator + 1)]);
  }
  const keys = new Map(entries.map(([id, encoded]) => [id, Buffer.from(encoded, "base64")]));
  for (const [id, key] of keys) if (key.length !== 32) throw new Error(`Encryption key ${id} must decode to 32 bytes.`);
  return { activeKeyId, keys };
}

