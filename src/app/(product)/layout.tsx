import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { SampleDataBanner } from "@/components/shell/sample-data-banner";
import { ViewerRoot } from "@/features/auth/viewer-root";
import { privyAppId } from "@/auth/privy-env";

/**
 * The Kova product shell. A route group, so it adds no URL segment.
 *
 * Wraps `/app`, `/play`, `/tables/*`, `/markets/*`, `/leaderboard`,
 * `/profile/*`, `/portfolio` and `/settings`. The viewer (guest or signed in) is
 * resolved once here; without a Privy app the shell still renders as a guest and
 * sign-in is reported as unavailable rather than broken.
 */
export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ViewerRoot appId={privyAppId()}>
      <AppShell banner={<SampleDataBanner />}>{children}</AppShell>
    </ViewerRoot>
  );
}
