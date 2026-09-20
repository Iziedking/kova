"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { KovaIdentity } from "@/types/social";

/**
 * The single place UI code learns who the viewer is and how to authenticate.
 *
 * Implemented by `PrivyViewerBridge` inside a `PrivyProvider`, and by
 * `StaticViewerProvider` where Privy is not configured or not mounted. Screens
 * depend only on this context, never on Privy hooks, so they render (as a
 * guest) in every environment.
 */
export type AuthResult = { ok: true } | { ok: false; message: string };

export type EmailFlowStatus = "idle" | "sending" | "awaiting-code" | "verifying" | "done" | "error";

export interface ViewerActions {
  loginWithX: () => Promise<AuthResult>;
  sendEmailCode: (email: string) => Promise<AuthResult>;
  verifyEmailCode: (code: string) => Promise<AuthResult>;
  /** Opens the wallet-only sign-in. */
  loginWithWallet: () => void;
  /** Links a Solana wallet to the signed-in account. */
  connectWallet: () => void;
}

export interface ViewerPrefill {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Viewer {
  status: "loading" | "guest" | "authed";
  /** False when no Privy app is configured, so sign-in cannot be offered. */
  authAvailable: boolean;
  /** True only in fixture mode with the preview viewer flag; never in production. */
  preview: boolean;
  userId: string | null;
  email: string | null;
  xHandle: string | null;
  walletAddress: string | null;
  identity: KovaIdentity | null;
  /** Signed in, but has not chosen a Kova username yet. */
  needsIdentity: boolean;
  prefill: ViewerPrefill;
  emailStatus: EmailFlowStatus;
  actions: ViewerActions;
  getAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  saveIdentity: (identity: KovaIdentity) => void;
}

const UNAVAILABLE: AuthResult = { ok: false, message: "Sign in isn't available in this environment." };

const noopActions: ViewerActions = {
  loginWithX: async () => UNAVAILABLE,
  sendEmailCode: async () => UNAVAILABLE,
  verifyEmailCode: async () => UNAVAILABLE,
  loginWithWallet: () => undefined,
  connectWallet: () => undefined,
};

export const GUEST_VIEWER: Viewer = {
  status: "guest",
  authAvailable: false,
  preview: false,
  userId: null,
  email: null,
  xHandle: null,
  walletAddress: null,
  identity: null,
  needsIdentity: false,
  prefill: { username: "", displayName: null, avatarUrl: null },
  emailStatus: "idle",
  actions: noopActions,
  getAccessToken: async () => null,
  logout: async () => undefined,
  saveIdentity: () => undefined,
};

const ViewerContext = createContext<Viewer>(GUEST_VIEWER);

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}

export function ViewerProvider({ value, children }: { value: Viewer; children: ReactNode }) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/** Where Privy is not mounted: a guest with sign-in reported as unavailable. */
export function StaticViewerProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => GUEST_VIEWER, []);
  return <ViewerProvider value={value}>{children}</ViewerProvider>;
}
