"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

/**
 * Authentication only.
 *
 * `createOnLogin: "off"` on both chains is the custody boundary: signing in
 * gives KOVA an identity and nothing else. No embedded wallet is created, no key
 * is held, and nothing in the app may request a signature. Do not add
 * `useDelegatedActions`, `useSessionSigners` or any wallet-api import here
 * before the phase-00 gates pass.
 *
 * Mounted only around `/login` and `/app`. The landing page never loads it.
 */
export function KovaPrivyProvider({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "#05070B",
          accentColor: "#5BC8E0",
          landingHeader: "Sign in to KOVA",
          loginMessage: "Reviewing a market needs no account. Sign in when you want to back one.",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
