import type { ReactNode } from "react";

/**
 * Build-time stand-in for `preview-viewer.tsx` and `stub-viewer.tsx` when fixtures
 * are not enabled (see `next.config.ts`). Real builds ship no stub auth, no
 * placeholder identities and no fixed one-time code.
 */
function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const PreviewViewerProvider = Passthrough;
export const StubViewerProvider = Passthrough;
