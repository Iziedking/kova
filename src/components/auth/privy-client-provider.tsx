"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { KOVA_SOLANA_CHAIN, KOVA_SOLANA_RPC } from "@/wallet/chain";
import { PrivyViewerBridge } from "@/features/auth/privy-viewer-bridge";

/**
 * Authentication, plus player-approved game signatures.
 *
 * Custody boundary: Kova never holds a key. A player without a wallet gets a
 * Privy-built Solana wallet at sign-in; its key stays with the player through
 * Privy, and every signature is approved in Privy's own prompt. Players can use
 * Phantom or another wallet instead. The only signatures the app requests are a
 * wallet-ownership message, a stake deposit or a claim (see `gameWallet` in
 * `privy-viewer-bridge.tsx`). Do not add `useDelegatedActions`,
 * `useSessionSigners` or any other signer that lets Kova sign for a player.
 *
 * The visible experience is Kova's own (`/login`, `LoginPanel`), built on
 * Privy's headless hooks. The provider still hosts the secure flows: X OAuth,
 * email OTP and external wallet connection. Login methods must also be enabled
 * in the Privy dashboard for this app id.
 *
 * Mounted around the product shell and `/login`. The marketing landing never
 * loads it.
 */
export function KovaPrivyProvider({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["twitter", "email", "wallet"],
        appearance: {
          theme: "#0D0E13",
          accentColor: "#9B6CFF",
          landingHeader: "Sign in to Kova",
          loginMessage: "Browsing needs no account. Sign in to play, challenge and keep your record.",
          showWalletLoginFirst: false,
          walletChainType: "solana-only",
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          // A player who signs in with email or X gets a Solana wallet, so no extension is needed.
          // Anyone who already has a wallet keeps using it.
          solana: { createOnLogin: "users-without-wallets" },
        },
        solana: {
          rpcs: {
            [KOVA_SOLANA_CHAIN]: {
              rpc: createSolanaRpc(KOVA_SOLANA_RPC[KOVA_SOLANA_CHAIN].http),
              rpcSubscriptions: createSolanaRpcSubscriptions(KOVA_SOLANA_RPC[KOVA_SOLANA_CHAIN].ws),
            },
          },
        },
      }}
    >
      <PrivyViewerBridge>{children}</PrivyViewerBridge>
    </PrivyProvider>
  );
}
