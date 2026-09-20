"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { GUEST_VIEWER, ViewerProvider, type Viewer } from "@/features/auth/viewer";

/**
 * DEVELOPMENT ONLY. A signed-in viewer for reviewing the authenticated shell
 * without a Privy app. `isPreviewViewer()` requires fixture mode, so this can
 * never activate against real data, and the shell shows the "Sample data" banner.
 * It starts without a wallet (like a fresh account); connecting one links a
 * clearly fake sample address so the money-action gate can be exercised.
 */
export function PreviewViewerProvider({ children }: { children: ReactNode }) {
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
      identity: { username: "ANSEM", displayName: null, avatarUrl: null, avatarSeed: "ANSEM" },
      actions: { ...GUEST_VIEWER.actions, connectWallet },
    }),
    [wallet, connectWallet],
  );
  return <ViewerProvider value={value}>{children}</ViewerProvider>;
}
