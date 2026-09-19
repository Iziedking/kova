/** Solana wallet ownership challenge. Verification uses Node's Ed25519 implementation. */
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface WalletChallenge {
  id: string;
  principalId: string;
  wallet: string;
  origin: string;
  nonceHash: string;
  message: string;
  expiresAt: string;
  consumedAt: string | null;
}

export function buildWalletChallenge(input: { id: string; principalId: string; wallet: string; origin: string; now: Date; ttlSeconds?: number }): WalletChallenge & { nonce: string } {
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(input.now.getTime() + (input.ttlSeconds ?? 300) * 1_000).toISOString();
  const message = [
    "KOVA wallet verification",
    `Origin: ${input.origin}`,
    `Wallet: ${input.wallet}`,
    `Principal: ${input.principalId}`,
    `Challenge: ${input.id}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
    "This signature proves wallet ownership. It does not authorize a transaction.",
  ].join("\n");
  return { id: input.id, principalId: input.principalId, wallet: input.wallet, origin: input.origin, nonce, nonceHash: createHash("sha256").update(nonce).digest("hex"), message, expiresAt, consumedAt: null };
}

export function verifyWalletSignature(wallet: string, message: string, signatureBase64: string): boolean {
  try {
    const rawPublicKey = Buffer.from(new PublicKey(wallet).toBytes());
    const publicKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]), format: "der", type: "spki" });
    const signature = Buffer.from(signatureBase64, "base64");
    return signature.length === 64 && verify(null, Buffer.from(message, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}

