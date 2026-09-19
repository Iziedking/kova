/** Solana web3.js 1.99.0 exact-mint read, inspected against installed source and Solana RPC docs on 2026-09-19. */
import { Connection, PublicKey } from "@solana/web3.js";

export interface MintIdentityEvidence {
  sourceClass: "solana_rpc";
  mint: string;
  exists: boolean;
  tokenProgram: string | null;
  decimals: number | null;
  mintAuthority: "none" | "present" | "unknown";
  freezeAuthority: "none" | "present" | "unknown";
  slot: number;
  observedAt: string;
}

export async function readMintIdentity(connection: Connection, mint: string): Promise<MintIdentityEvidence> {
  const publicKey = new PublicKey(mint);
  const response = await connection.getParsedAccountInfo(publicKey, "finalized");
  const observedAt = new Date().toISOString();
  if (!response.value) return { sourceClass: "solana_rpc", mint, exists: false, tokenProgram: null, decimals: null, mintAuthority: "unknown", freezeAuthority: "unknown", slot: response.context.slot, observedAt };
  const data = response.value.data;
  if (!isParsedMint(data)) return { sourceClass: "solana_rpc", mint, exists: true, tokenProgram: response.value.owner.toBase58(), decimals: null, mintAuthority: "unknown", freezeAuthority: "unknown", slot: response.context.slot, observedAt };
  return {
    sourceClass: "solana_rpc",
    mint,
    exists: data.parsed.type === "mint",
    tokenProgram: response.value.owner.toBase58(),
    decimals: data.parsed.type === "mint" ? data.parsed.info.decimals : null,
    mintAuthority: data.parsed.type === "mint" ? (data.parsed.info.mintAuthority === null ? "none" : "present") : "unknown",
    freezeAuthority: data.parsed.type === "mint" ? (data.parsed.info.freezeAuthority === null ? "none" : "present") : "unknown",
    slot: response.context.slot,
    observedAt,
  };
}

function isParsedMint(value: unknown): value is { parsed: { type: string; info: { decimals: number; mintAuthority: string | null; freezeAuthority: string | null } } } {
  if (typeof value !== "object" || value === null || !("parsed" in value)) return false;
  const parsed = (value as { parsed?: unknown }).parsed;
  return typeof parsed === "object" && parsed !== null && "type" in parsed && "info" in parsed;
}

