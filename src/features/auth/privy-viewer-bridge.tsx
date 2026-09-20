"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { ViewerProvider, type AuthResult, type EmailFlowStatus, type Viewer } from "./viewer";
import { suggestUsername, useStoredIdentity, writeIdentity } from "./identity-store";
import type { KovaIdentity } from "@/types/social";

/**
 * Adapts Privy's headless hooks to the app's `Viewer` contract, so the Kova UI
 * owns the whole sign-in experience while Privy keeps doing the secure parts
 * (OAuth, OTP, wallet signatures, session tokens).
 *
 * Must render inside `PrivyProvider`. It requests no signature and creates no
 * wallet; see the custody note in `privy-client-provider.tsx`.
 */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    // Privy messages are user-safe but terse; only surface them for the OTP cases.
    if (/code/i.test(error.message)) return error.message;
  }
  return fallback;
}

const SESSION_GRACE_MS = 4000;

const EMAIL_STATUS: Record<string, EmailFlowStatus> = {
  initial: "idle",
  "sending-code": "sending",
  "awaiting-code-input": "awaiting-code",
  "submitting-code": "verifying",
  done: "done",
  error: "error",
};

export function PrivyViewerBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken, login, linkWallet } = usePrivy();
  const oauth = useLoginWithOAuth();
  const emailLogin = useLoginWithEmail();

  // If Privy cannot initialise (offline, blocked, outage) the session would stay "loading" forever.
  // After a grace period the viewer becomes a guest so public browsing and the sign-in gates keep working.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setGaveUp(true), SESSION_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const userId = authenticated ? (user?.id ?? null) : null;
  const stored = useStoredIdentity(userId);

  const email = user?.email?.address ?? null;
  const xAccount = user?.twitter ?? null;
  const solana = user?.linkedAccounts.find(
    (account) => account.type === "wallet" && "chainType" in account && account.chainType === "solana",
  );
  const walletAddress = solana && "address" in solana ? solana.address : null;

  const loginWithX = useCallback(async (): Promise<AuthResult> => {
    try {
      await oauth.initOAuth({ provider: "twitter" });
      return { ok: true };
    } catch {
      return { ok: false, message: "We couldn't sign you in with X. Try again." };
    }
  }, [oauth]);

  const sendEmailCode = useCallback(
    async (address: string): Promise<AuthResult> => {
      try {
        await emailLogin.sendCode({ email: address });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageOf(error, "We couldn't send a code to that email. Check it and try again.") };
      }
    },
    [emailLogin],
  );

  const verifyEmailCode = useCallback(
    async (code: string): Promise<AuthResult> => {
      try {
        await emailLogin.loginWithCode({ code });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageOf(error, "That code didn't work. Check it or request a new one.") };
      }
    },
    [emailLogin],
  );

  const saveIdentity = useCallback(
    (identity: KovaIdentity) => {
      if (userId) writeIdentity(userId, identity);
    },
    [userId],
  );

  const viewer = useMemo<Viewer>(() => {
    const status: Viewer["status"] = !ready ? (gaveUp ? "guest" : "loading") : authenticated ? "authed" : "guest";
    const identity = stored ?? null;
    return {
      status,
      authAvailable: true,
      preview: false,
      userId,
      email,
      xHandle: xAccount?.username ?? null,
      walletAddress,
      identity,
      needsIdentity: status === "authed" && stored === null,
      prefill: {
        username: suggestUsername(xAccount?.username ?? email),
        displayName: xAccount?.name ?? null,
        avatarUrl: xAccount?.profilePictureUrl ?? null,
      },
      emailStatus: EMAIL_STATUS[emailLogin.state.status] ?? "idle",
      actions: {
        loginWithX,
        sendEmailCode,
        verifyEmailCode,
        loginWithWallet: () => login({ loginMethods: ["wallet"] }),
        connectWallet: () => linkWallet(),
      },
      getAccessToken: async () => (authenticated ? getAccessToken() : null),
      logout: async () => {
        await logout();
      },
      saveIdentity,
    };
  }, [
    ready,
    gaveUp,
    authenticated,
    stored,
    userId,
    email,
    xAccount,
    walletAddress,
    emailLogin.state.status,
    loginWithX,
    sendEmailCode,
    verifyEmailCode,
    login,
    linkWallet,
    getAccessToken,
    logout,
    saveIdentity,
  ]);

  return <ViewerProvider value={viewer}>{children}</ViewerProvider>;
}
