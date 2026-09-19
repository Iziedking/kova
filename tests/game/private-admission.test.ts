import assert from "node:assert/strict";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { decryptPrivateJson, encryptPrivateJson, parsePickKeyring } from "../../src/backend/game/pick-crypto";
import { buildWalletChallenge, verifyWalletSignature } from "../../src/backend/game/wallet-proof";
import { bearerFromHeader } from "../../src/backend/game/auth";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

test("private pick encryption detects ciphertext and context tampering", () => {
  const keyring = parsePickKeyring("v1", randomBytes(32).toString("base64"));
  const context = { tableId: "table", principalId: "principal", kind: "pick" };
  const encrypted = encryptPrivateJson({ mint: "secret" }, context, keyring);
  assert.deepEqual(decryptPrivateJson(encrypted, context, keyring), { mint: "secret" });
  assert.throws(() => decryptPrivateJson({ ...encrypted, ciphertextBase64: Buffer.from("tampered").toString("base64") }, context, keyring));
  assert.throws(() => decryptPrivateJson(encrypted, { ...context, principalId: "attacker" }, keyring), /context/);
});

test("key rotation reads old records while new records use the active key", () => {
  const oldKey = randomBytes(32).toString("base64");
  const newKey = randomBytes(32).toString("base64");
  const context = { tableId: "table", principalId: "principal", kind: "pick" };
  const oldRecord = encryptPrivateJson({ mint: "old" }, context, parsePickKeyring("v1", oldKey));
  const rotated = parsePickKeyring("v2", newKey, `v1:${oldKey}`);
  const newRecord = encryptPrivateJson({ mint: "new" }, context, rotated);
  assert.equal(oldRecord.keyId, "v1");
  assert.equal(newRecord.keyId, "v2");
  assert.deepEqual(decryptPrivateJson(oldRecord, context, rotated), { mint: "old" });
  assert.deepEqual(decryptPrivateJson(newRecord, context, rotated), { mint: "new" });
});

test("wallet challenge verifies the exact Solana wallet and message", () => {
  const wallet = Keypair.generate();
  const challenge = buildWalletChallenge({ id: crypto.randomUUID(), principalId: crypto.randomUUID(), wallet: wallet.publicKey.toBase58(), origin: "http://localhost:3000", now: new Date("2026-09-19T12:00:00.000Z") });
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(wallet.secretKey.slice(0, 32))]), format: "der", type: "pkcs8" });
  const signature = sign(null, Buffer.from(challenge.message), privateKey).toString("base64");
  assert.equal(verifyWalletSignature(challenge.wallet, challenge.message, signature), true);
  assert.equal(verifyWalletSignature(challenge.wallet, `${challenge.message}\nchanged`, signature), false);
  assert.match(challenge.message, /does not authorize a transaction/);
});

test("bearer parsing rejects ambiguous authorization headers", () => {
  assert.equal(bearerFromHeader("Bearer token"), "token");
  assert.equal(bearerFromHeader("bearer token"), null);
  assert.equal(bearerFromHeader("Bearer one two"), null);
  assert.equal(bearerFromHeader(undefined), null);
});

