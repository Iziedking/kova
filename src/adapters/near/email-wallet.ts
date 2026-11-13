/**
 * Email sign-in on NEAR, through a Privy wallet.
 *
 * Privy creates an ed25519 wallet for an email login and signs raw hashes with it. On NEAR that
 * wallet's address is an implicit account: 64 hex characters that are the public key itself. This
 * module turns that into a near-api-js `Signer`, so the rest of the app signs with it exactly as it
 * signs with a key pair, and defines the proof a new email account sends to have Kova fund it.
 *
 * Pure: no React, no Privy import. The browser passes in Privy's `signRawHash`; tests pass a key pair.
 */
import { KeyType, PublicKey, Signer } from "near-api-js";

export type RawHashSigner = (hash: `0x${string}`) => Promise<`0x${string}` | string>;

const IMPLICIT = /^[0-9a-f]{64}$/;

export function isImplicitAccount(accountId: string): boolean {
  return IMPLICIT.test(accountId);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean)) throw new Error("Not a hex string.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The ed25519 public key an implicit account stands for. */
export function implicitPublicKey(accountId: string): PublicKey {
  if (!isImplicitAccount(accountId)) throw new Error(`${accountId} is not a NEAR implicit account.`);
  return new PublicKey({ keyType: KeyType.ED25519, data: fromHex(accountId) });
}

/** A near-api-js signer whose signatures come from a raw-hash signer (Privy's wallet). */
export class EmailWalletSigner extends Signer {
  private readonly publicKey: PublicKey;

  constructor(
    readonly accountId: string,
    private readonly signHash: RawHashSigner,
  ) {
    super();
    this.publicKey = implicitPublicKey(accountId);
  }

  async getPublicKey(): Promise<PublicKey> {
    return this.publicKey;
  }

  /** near-api-js hands this the 32-byte sha256 of the transaction (or NEP-413 payload). */
  protected async signBytes(hash: Uint8Array): Promise<Uint8Array> {
    const signature = fromHex(await this.signHash(`0x${toHex(hash)}`));
    if (signature.length !== 64) throw new Error("The email wallet returned a signature of the wrong length.");
    if (!this.publicKey.verify(hash, signature)) throw new Error("The email wallet's signature does not match its account.");
    return signature;
  }
}

/**
 * What a new email account signs to ask Kova for its starting NEAR. It names the Privy user, so a
 * proof cannot be replayed for another login, and the network and contract, so it cannot be
 * replayed on another deployment.
 */
export function fundingMessage(input: { privyUserId: string; accountId: string; network: string; contractId: string }): string {
  return `Kova on NEAR: fund ${input.accountId} for ${input.privyUserId} on ${input.network} (${input.contractId})`;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function fundingHash(input: Parameters<typeof fundingMessage>[0]): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(fundingMessage(input)));
}

/** True when `signatureHex` is the account's own signature over the funding message. */
export async function verifyFundingProof(input: Parameters<typeof fundingMessage>[0] & { signature: string }): Promise<boolean> {
  try {
    const signature = fromHex(input.signature);
    if (signature.length !== 64) return false;
    return implicitPublicKey(input.accountId).verify(await fundingHash(input), signature);
  } catch {
    return false;
  }
}
