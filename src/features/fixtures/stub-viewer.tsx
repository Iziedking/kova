"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { suggestUsername, useStoredIdentity, writeIdentity } from "@/features/auth/identity-store";
import { GUEST_VIEWER, ViewerProvider, type AuthResult, type EmailFlowStatus, type Viewer } from "@/features/auth/viewer";
import type { KovaIdentity } from "@/types/social";

/**
 * DEVELOPMENT / TEST ONLY. A deterministic auth provider standing in for Privy:
 *
 *  - Continue with X always reports a provider failure (to exercise that state).
 *  - Email accepts any address except one containing "fail"; the code is 424242.
 *  - Wallet sign-in succeeds immediately.
 *
 * Gated by `authStubEnabled()` (fixtures + explicit flag), so it cannot activate
 * against real data. It exists so the Kova sign-in state machine is testable
 * without depending on a third party's availability.
 */
const STUB_USER = "fixture-stub-user";
export const STUB_OTP = "424242";

export function StubViewerProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailFlowStatus>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const stored = useStoredIdentity(authed ? STUB_USER : null);

  const loginWithX = useCallback(async (): Promise<AuthResult> => ({ ok: false, message: "We couldn't sign you in with X. Try again." }), []);
  const sendEmailCode = useCallback(async (address: string): Promise<AuthResult> => {
    if (address.includes("fail")) {
      setEmailStatus("error");
      return { ok: false, message: "We couldn't send a code to that email. Check it and try again." };
    }
    setEmail(address);
    setEmailStatus("awaiting-code");
    return { ok: true };
  }, []);
  const verifyEmailCode = useCallback(async (code: string): Promise<AuthResult> => {
    if (code !== STUB_OTP) return { ok: false, message: "That code didn't work. Check it or request a new one." };
    setAuthed(true);
    setEmailStatus("done");
    return { ok: true };
  }, []);

  const saveIdentity = useCallback((identity: KovaIdentity) => writeIdentity(STUB_USER, identity), []);

  const value = useMemo<Viewer>(
    () => ({
      ...GUEST_VIEWER,
      status: authed ? "authed" : "guest",
      authAvailable: true,
      userId: authed ? STUB_USER : null,
      email: authed ? email : null,
      identity: stored ?? null,
      needsIdentity: authed && stored === null,
      prefill: { username: suggestUsername(email), displayName: null, avatarUrl: null },
      emailStatus,
      actions: {
        loginWithX,
        sendEmailCode,
        verifyEmailCode,
        loginWithWallet: () => setAuthed(true),
        connectWallet: () => undefined,
      },
      getAccessToken: async () => null,
      logout: async () => setAuthed(false),
      saveIdentity,
    }),
    [authed, email, stored, emailStatus, loginWithX, sendEmailCode, verifyEmailCode, saveIdentity],
  );

  return <ViewerProvider value={value}>{children}</ViewerProvider>;
}
