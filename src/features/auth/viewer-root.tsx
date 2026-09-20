"use client";

import type { ReactNode } from "react";
import { KovaPrivyProvider } from "@/components/auth/privy-client-provider";
import { PreviewViewerProvider } from "@/features/fixtures/preview-viewer";
import { isPreviewViewer } from "@/services";
import { StaticViewerProvider } from "./viewer";

/**
 * Picks who the viewer is for a subtree:
 *  - the development preview viewer (fixtures + flag only),
 *  - a Privy-backed viewer when an app id is configured,
 *  - otherwise a guest, with sign-in reported as unavailable.
 */
export function ViewerRoot({ appId, children }: { appId: string | null; children: ReactNode }) {
  if (isPreviewViewer()) return <PreviewViewerProvider>{children}</PreviewViewerProvider>;
  if (appId) return <KovaPrivyProvider appId={appId}>{children}</KovaPrivyProvider>;
  return <StaticViewerProvider>{children}</StaticViewerProvider>;
}
