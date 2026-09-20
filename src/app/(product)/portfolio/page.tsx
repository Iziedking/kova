import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/auth/session";
import { previewViewerEnabled } from "@/auth/preview";
import { loginHref } from "@/auth/redirect";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { AuthGuard } from "@/components/auth/auth-guard";

/** Session-dependent: never prerendered, whatever the build-time environment holds. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio · Kova",
  description: "Your holdings, match positions and activity.",
};

/**
 * Personal, so it is protected twice: `src/proxy.ts` redirects when there is no
 * session cookie, and this page verifies the token server-side (the proxy check is
 * only optimistic). `AuthGuard` covers a session that expires while the page is open.
 */
export default async function PortfolioPage() {
  if (!previewViewerEnabled()) {
    const session = await getSession();
    if (!session) redirect(loginHref("/portfolio", "expired"));
  }
  return (
    <AuthGuard>
      <PortfolioScreen />
    </AuthGuard>
  );
}
