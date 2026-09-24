"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { PrivyViewerBridge } from "@/features/auth/privy-viewer-bridge";

/**
 * Authentication only.
 *
 * `createOnLogin: "off"` on both chains is the custody boundary: signing in
 * gives Kova an identity and nothing else. No embedded wallet is created, no key
 * is held, and nothing in the app may request a signature. Do not add
 * `useDelegatedActions`, `useSessionSigners` or any wallet-api import here
 * before the phase-00 gates pass.
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
      }}
    >
      <PrivyViewerBridge>{children}</PrivyViewerBridge>
    </PrivyProvider>
  );
}
