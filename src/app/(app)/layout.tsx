import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { AppFooter } from "@/components/shell/app-footer";
import { StaticField } from "@/components/background/static-field";
import { KovaPrivyProvider } from "@/components/auth/privy-client-provider";
import { privyAppId } from "@/auth/privy-env";

/**
 * The `/app` shell. A route group, so it adds no URL segment.
 *
 * The app background is the static field, never the animated lattice: spec
 * section 6.2 keeps motion off surfaces that carry financial values.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const appId = privyAppId();

  const shell = (
    <div className="relative isolate min-h-screen">
      <StaticField className="fixed opacity-60" />
      <div className="relative">
        <AppHeader />
        <div className="mx-auto max-w-[1500px] px-6 py-12">{children}</div>
        <AppFooter />
      </div>
    </div>
  );

  // Without an app id the shell still renders; the session menu degrades to a
  // sign-in link that reaches the honest unconfigured login page.
  return appId ? <KovaPrivyProvider appId={appId}>{shell}</KovaPrivyProvider> : shell;
}
