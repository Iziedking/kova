"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { AppHeader } from "./app-header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileHeader } from "./mobile-header";
import { ShellProvider } from "./shell-context";

/** Routes that render their own contextual mobile top bar (`MobileTopBar`). */
const OWN_MOBILE_BAR = [/^\/tables\//];

/**
 * The signed-in-or-not product shell: desktop header, mobile header + bottom
 * navigation, global overlays and toasts. Guests get the same shell; account
 * actions gate at the point of use.
 */
export function AppShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  const pathname = usePathname();
  const ownMobileBar = OWN_MOBILE_BAR.some((pattern) => pattern.test(pathname));

  return (
    <ShellProvider>
      <div className="relative isolate min-h-dvh bg-bg">
        {banner}
        <AppHeader />
        {ownMobileBar ? null : <MobileHeader />}
        <div className="pb-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+24px)] md:pb-16">{children}</div>
        <MobileBottomNav />
        <Toaster />
      </div>
    </ShellProvider>
  );
}
