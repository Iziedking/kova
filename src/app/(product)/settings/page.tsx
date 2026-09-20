import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/auth/session";
import { previewViewerEnabled } from "@/auth/preview";
import { loginHref } from "@/auth/redirect";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SettingsScreen } from "@/features/settings/settings-screen";

export const metadata: Metadata = { title: "Settings · Kova" };

export default async function SettingsPage() {
  if (!previewViewerEnabled()) {
    const session = await getSession();
    if (!session) redirect(loginHref("/settings", "expired"));
  }
  return (
    <AuthGuard>
      <SettingsScreen />
    </AuthGuard>
  );
}
