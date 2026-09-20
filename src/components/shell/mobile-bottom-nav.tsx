"use client";

import { BarChart3, Crown, House, Trophy, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { loginHref } from "@/auth/redirect";
import { useViewer } from "@/features/auth/viewer";

interface Tab {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  match: readonly string[];
  primary?: boolean;
}

/**
 * Home / Markets / Play / Rank / Profile. Play is centred and carries the
 * accent; it is stronger than its neighbours but not a floating button
 * (blueprint 2.2). Sits above the home indicator via the safe-area inset.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const viewer = useViewer();
  const authed = viewer.status === "authed";
  const profileHref = authed ? `/profile/${encodeURIComponent(viewer.identity?.username ?? "me")}` : loginHref("/app");

  const tabs: Tab[] = [
    { key: "home", label: "Home", href: "/app", icon: House, match: ["/app"] },
    { key: "markets", label: "Markets", href: "/markets", icon: BarChart3, match: ["/markets"] },
    { key: "play", label: "Play", href: "/play", icon: Trophy, match: ["/play", "/tables"], primary: true },
    { key: "rank", label: "Rank", href: "/leaderboard", icon: Crown, match: ["/leaderboard"] },
    { key: "profile", label: "Profile", href: profileHref, icon: User, match: ["/profile", "/portfolio", "/settings"] },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-bg/95 pb-safe backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid h-[var(--spacing-bottom-nav)] max-w-[520px] grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          const Icon = tab.icon;
          return (
            <li key={tab.key} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active || tab.primary ? "text-accent" : "text-text-secondary",
                )}
              >
                <Icon size={tab.primary ? 24 : 22} strokeWidth={active || tab.primary ? 2.2 : 1.8} aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
