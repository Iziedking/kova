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
 * `createOnLogin: "off"` on both chains is the custody boundary: signing in
 * gives Kova an identity and nothing else. No embedded wallet is created and no
 * key is held. The only signatures the app requests are the player's own wallet
 * approving a wallet-ownership message, a stake deposit or a claim, each through
 * the wallet's prompt (see `gameWallet` in `privy-viewer-bridge.tsx`). Do not add
 * `useDelegatedActions`, `useSessionSigners` or any other signer here.
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
          solana: { createOnLogin: "off" },
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
