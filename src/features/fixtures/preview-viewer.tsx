"use client";

import { useMemo, type ReactNode } from "react";
import { GUEST_VIEWER, ViewerProvider, type Viewer } from "@/features/auth/viewer";

/**
 * DEVELOPMENT ONLY. A signed-in viewer for reviewing the authenticated shell
 * without a Privy app. `isPreviewViewer()` requires fixture mode, so this can
 * never activate against real data, and the shell shows the "Sample data" banner.
 */
export function PreviewViewerProvider({ children }: { children: ReactNode }) {
  const value = useMemo<Viewer>(
    () => ({
      ...GUEST_VIEWER,
      status: "authed",
      authAvailable: true,
      preview: true,
      userId: "fixture-viewer",
      xHandle: "blknoi206",
      identity: { username: "ANSEM", displayName: null, avatarUrl: null, avatarSeed: "ANSEM" },
    }),
    [],
  );
  return <ViewerProvider value={value}>{children}</ViewerProvider>;
}
