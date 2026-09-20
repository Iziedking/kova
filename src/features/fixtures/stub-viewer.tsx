"use client";

import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { suggestUsername, useStoredIdentity, writeIdentity } from "@/features/auth/identity-store";
import { GUEST_VIEWER, ViewerProvider, type AuthResult, type EmailFlowStatus, type Viewer } from "@/features/auth/viewer";
import type { KovaIdentity } from "@/types/social";

/**
 * DEVELOPMENT / TEST ONLY. A deterministic auth provider standing in for Privy:
 *
 *  - Continue with X always reports a provider failure (to exercise that state).
 *  - Email accepts any address except one containing "fail"; the code is 424242.
 *  - Wallet sign-in succeeds immediately and links a sample wallet.
 *  - "Connect wallet" (the money gate) links the sample wallet.
 *
 * The session lives in `sessionStorage` so it survives navigation between the
 * login page and the product shell, like a real session would. Gated by
 * `authStubEnabled()` (fixtures + explicit flag), so it cannot activate against
 * real data.
 */
const STUB_USER = "fixture-stub-user";
const SESSION_KEY = "kova.stub.session.v1";
export const STUB_OTP = "424242";
/** Obviously not a real address, but shaped enough for the UI's address formatting. */
export const STUB_WALLET = "FixtureWallet1111111111111111111111111111111";

interface Session {
  authed: boolean;
  email: string | null;
  wallet: string | null;
}

const LOGGED_OUT: Session = { authed: false, email: null, wallet: null };
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Session } | null = null;

function readSession(): Session {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return cached?.value ?? LOGGED_OUT;
  }
  if (cached && cached.raw === raw) return cached.value;
  let value = LOGGED_OUT;
  try {
    if (raw) value = { ...LOGGED_OUT, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    value = LOGGED_OUT;
  }
  cached = { raw, value };
  return value;
}

function writeSession(next: Session) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    cached = { raw: JSON.stringify(next), value: next };
  }
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function StubViewerProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, readSession, () => LOGGED_OUT);
  const stored = useStoredIdentity(session.authed ? STUB_USER : null);

  const emailStatus: EmailFlowStatus = session.authed ? "done" : "idle";

  const loginWithX = useCallback(async (): Promise<AuthResult> => ({ ok: false, message: "We couldn't sign you in with X. Try again." }), []);
  const sendEmailCode = useCallback(async (address: string): Promise<AuthResult> => {
    if (address.includes("fail")) return { ok: false, message: "We couldn't send a code to that email. Check it and try again." };
    writeSession({ ...readSession(), email: address });
    return { ok: true };
  }, []);
  const verifyEmailCode = useCallback(async (code: string): Promise<AuthResult> => {
    if (code !== STUB_OTP) return { ok: false, message: "That code didn't work. Check it or request a new one." };
    writeSession({ ...readSession(), authed: true });
    return { ok: true };
  }, []);
  const saveIdentity = useCallback((identity: KovaIdentity) => writeIdentity(STUB_USER, identity), []);

  const value = useMemo<Viewer>(
    () => ({
      ...GUEST_VIEWER,
      status: session.authed ? "authed" : "guest",
      authAvailable: true,
      userId: session.authed ? STUB_USER : null,
      email: session.authed ? session.email : null,
      walletAddress: session.authed ? session.wallet : null,
      identity: stored ?? null,
      needsIdentity: session.authed && stored === null,
      prefill: { username: suggestUsername(session.email), displayName: null, avatarUrl: null },
      emailStatus,
      actions: {
        loginWithX,
        sendEmailCode,
        verifyEmailCode,
        loginWithWallet: () => writeSession({ authed: true, email: null, wallet: STUB_WALLET }),
        connectWallet: () => writeSession({ ...readSession(), wallet: STUB_WALLET }),
      },
      getAccessToken: async () => null,
      logout: async () => writeSession(LOGGED_OUT),
      saveIdentity,
    }),
    [session, stored, emailStatus, loginWithX, sendEmailCode, verifyEmailCode, saveIdentity],
  );

  return <ViewerProvider value={value}>{children}</ViewerProvider>;
}
