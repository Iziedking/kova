"use client";

/** Browser-only Wallet Standard discovery and connection seam. It never signs or broadcasts. Reviewed 2026-09-15. */
import { getWallets } from "@wallet-standard/app";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { Result } from "../domain/contracts";

export interface DiscoveredWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  wallet: Wallet;
}

export interface ConnectedWallet {
  walletName: string;
  address: string;
  chain: "solana:mainnet" | "solana:devnet";
}

function supportsSolana(wallet: Wallet): boolean {
  return wallet.chains.some((chain) => chain === "solana:mainnet" || chain === "solana:devnet");
}

function connectFeature(wallet: Wallet): StandardConnectFeature[typeof StandardConnect] | null {
  const feature = wallet.features[StandardConnect];
  return feature === undefined ? null : feature as StandardConnectFeature[typeof StandardConnect];
}

/** Pure registry projection kept separate so the browser seam can be tested without a wallet extension. */
export function filterSolanaWallets(wallets: readonly Wallet[]): readonly DiscoveredWallet[] {
  return wallets.filter(supportsSolana).map((wallet) => ({ name: wallet.name, icon: wallet.icon, chains: wallet.chains, wallet }));
}

export function selectSolanaAccount(accounts: readonly WalletAccount[]): WalletAccount | null {
  return accounts.find((account) => account.chains.includes("solana:mainnet") || account.chains.includes("solana:devnet")) ?? null;
}

export function selectSolanaChain(chains: readonly string[]): ConnectedWallet["chain"] | null {
  if (chains.includes("solana:mainnet")) return "solana:mainnet";
  if (chains.includes("solana:devnet")) return "solana:devnet";
  return null;
}

export function discoverSolanaWallets(): readonly DiscoveredWallet[] {
  if (typeof window === "undefined") return [];
  return filterSolanaWallets(getWallets().get());
}

export async function connectSolanaWallet(wallet: DiscoveredWallet): Promise<Result<ConnectedWallet>> {
  const feature = connectFeature(wallet.wallet);
  if (feature === null) return { ok: false, code: "WALLET_CONNECT_UNAVAILABLE", message: "This wallet does not expose the standard connection feature.", retryable: false };
  try {
    const result = await feature.connect();
    const account = selectSolanaAccount(result.accounts);
    if (account === null) return { ok: false, code: "SOLANA_ACCOUNT_NOT_FOUND", message: "The wallet did not return a Solana account.", retryable: false };
    const chain = selectSolanaChain(account.chains);
    if (chain === null) return { ok: false, code: "SOLANA_ACCOUNT_NOT_FOUND", message: "The wallet did not return a Solana account.", retryable: false };
    return { ok: true, value: { walletName: wallet.name, address: account.address, chain } };
  } catch {
    return { ok: false, code: "WALLET_CONNECTION_REJECTED", message: "The wallet connection was cancelled or rejected. No transaction was requested.", retryable: true };
  }
}
