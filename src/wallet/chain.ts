/**
 * The Solana cluster game transactions are signed for. Public by design: it only
 * selects the network the player's wallet submits to. Defaults to devnet, where
 * KOVA stakes a valueless TEST ANSEM token.
 */
export type KovaSolanaChain = "solana:devnet" | "solana:mainnet";

function readChain(value: string | undefined): KovaSolanaChain {
  return value === "solana:mainnet" ? "solana:mainnet" : "solana:devnet";
}

export const KOVA_SOLANA_CHAIN: KovaSolanaChain = readChain(process.env.NEXT_PUBLIC_KOVA_SOLANA_CHAIN);

export const KOVA_SOLANA_RPC: Record<KovaSolanaChain, { http: string; ws: string }> = {
  "solana:devnet": { http: "https://api.devnet.solana.com", ws: "wss://api.devnet.solana.com" },
  "solana:mainnet": { http: "https://api.mainnet-beta.solana.com", ws: "wss://api.mainnet-beta.solana.com" },
};
