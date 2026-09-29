"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ok } from "@/types/service";
import { fixtureGameWallet } from "./wallet";
import type { KovaIdentity } from "@/types/social";
import { GUEST_VIEWER, ViewerProvider, type Viewer } from "@/features/auth/viewer";

/**
 * DEVELOPMENT ONLY. A signed-in viewer for reviewing the authenticated shell
 * without a Privy app. `isPreviewViewer()` requires fixture mode, so this can
 * never activate against real data, and the shell shows the "Sample data" banner.
 * It starts without a wallet (like a fresh account); connecting one links a
 * clearly fake sample address so the money-action gate can be exercised.
 */
export function PreviewViewerProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<KovaIdentity>({ username: "ANSEM", displayName: null, avatarUrl: null, avatarSeed: "ANSEM" });
  const [wallet, setWallet] = useState<string | null>(null);
  const connectWallet = useCallback(() => setWallet("FixtureWallet1111111111111111111111111111111"), []);
  const value = useMemo<Viewer>(
    () => ({
      ...GUEST_VIEWER,
      status: "authed",
      authAvailable: true,
      preview: true,
      userId: "fixture-viewer",
      xHandle: "blknoi206",
      walletAddress: wallet,
      gameWallet: wallet ? fixtureGameWallet(wallet) : null,
      identity,
      saveIdentity: async (next) => { setIdentity(next); return ok(next, "fixture"); },
      actions: { ...GUEST_VIEWER.actions, connectWallet },
    }),
    [wallet, connectWallet, identity],
  );
  return <ViewerProvider value={value}>{children}</ViewerProvider>;
}
