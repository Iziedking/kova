"use client";

import type { ReactNode } from "react";
import { KovaPrivyProvider } from "@/components/auth/privy-client-provider";
import { authStubEnabled } from "@/auth/preview";
import { PreviewViewerProvider } from "@/features/fixtures/preview-viewer";
import { StubViewerProvider as StubAuthProvider } from "@/features/fixtures/stub-viewer";
import { isFixtureMode, isPreviewViewer } from "@/services";
import { StaticViewerProvider } from "./viewer";

/**
 * Picks who the viewer is for a subtree:
 *  - the deterministic auth stub or preview viewer (fixtures + explicit flag only),
 *  - a Privy-backed viewer when an app id is configured,
 *  - otherwise a guest, with sign-in reported as unavailable.
 */
export function ViewerRoot({ appId, children }: { appId: string | null; children: ReactNode }) {
  if (authStubEnabled({ NEXT_PUBLIC_KOVA_DATA_SOURCE: isFixtureMode() ? "fixtures" : "api", NEXT_PUBLIC_KOVA_AUTH_STUB: process.env.NEXT_PUBLIC_KOVA_AUTH_STUB })) {
    return <StubAuthProvider>{children}</StubAuthProvider>;
  }
  if (isPreviewViewer()) return <PreviewViewerProvider>{children}</PreviewViewerProvider>;
  if (appId) return <KovaPrivyProvider appId={appId}>{children}</KovaPrivyProvider>;
  return <StaticViewerProvider>{children}</StaticViewerProvider>;
}
