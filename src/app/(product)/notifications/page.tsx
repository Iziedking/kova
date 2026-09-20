import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/auth/session";
import { previewViewerEnabled } from "@/auth/preview";
import { loginHref } from "@/auth/redirect";
import { AuthGuard } from "@/components/auth/auth-guard";
import { NotificationsList } from "@/components/shell/notifications-drawer";
import { PageContainer } from "@/components/shell/page-container";

/** Session-dependent: never prerendered, whatever the build-time environment holds. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Notifications · Kova" };

export default async function NotificationsPage() {
  if (!previewViewerEnabled()) {
    const session = await getSession();
    if (!session) redirect(loginHref("/notifications", "expired"));
  }
  return (
    <PageContainer as="main" width="narrow" className="space-y-5">
      <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary">Notifications</h1>
      <AuthGuard>
        <div className="rounded-panel border border-border-subtle bg-surface-1 p-3">
          <NotificationsList />
        </div>
      </AuthGuard>
    </PageContainer>
  );
}
