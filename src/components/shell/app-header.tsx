"use client";

import { Bell, Search } from "lucide-react";
import Link from "next/link";
import { useViewer } from "@/features/auth/viewer";
import { shortAddress } from "@/lib/format";
import { KovaLockup } from "@/components/brand/kova-logo";
import { Button } from "@/components/ui/button";
import { DesktopNav } from "./desktop-nav";
import { useShell } from "./shell-context";
import { UserMenu } from "./user-menu";

/** A small stacked-bars mark: the wallet / portfolio entry point (Portfolio is not top-level nav). */
function PortfolioGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2.5" width="14" height="3.2" rx="1.2" fill="#c3a9ff" />
      <rect x="4" y="7.4" width="12" height="3.2" rx="1.2" fill="#9b6cff" />
      <rect x="2" y="12.3" width="14" height="3.2" rx="1.2" fill="#7c4dff" />
    </svg>
  );
}

/**
 * Desktop header: 64px, Kova at left, four destinations, search, then
 * portfolio / wallet / notifications / account at right (blueprint 2.1).
 * Below 1024px the header collapses to `MobileHeader` + bottom navigation.
 */
export function AppHeader() {
  const viewer = useViewer();
  const shell = useShell();
  const authed = viewer.status === "authed";

  return (
    <header className="sticky top-0 z-40 hidden h-[var(--spacing-header)] border-b border-border-subtle bg-bg/95 backdrop-blur-md md:block">
      <div className="mx-auto flex h-full max-w-[var(--container-trading)] items-center gap-4 px-6 xl:gap-6 xl:px-8">
        <Link href="/app" aria-label="Kova home" className="mr-2 shrink-0 lg:mr-6">
          <KovaLockup />
        </Link>

        <DesktopNav />

        <button
          type="button"
          onClick={shell.openSearch}
          aria-label="Search markets, users, or tables"
          className="group mx-auto hidden h-11 w-full max-w-[520px] min-w-0 flex-1 items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-left transition-colors hover:border-border-strong md:flex"
        >
          <Search size={17} className="shrink-0 text-text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-text-muted">Search markets, users, or tables…</span>
          <kbd className="hidden h-6 w-7 place-items-center rounded-md border border-border-strong text-[12px] text-text-secondary lg:grid">/</kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          {authed ? (
            <>
              <Link
                href="/portfolio"
                aria-label="Portfolio"
                className="hidden h-11 w-11 place-items-center rounded-xl border border-border-subtle bg-surface-1 transition-colors hover:border-border-strong xl:grid"
              >
                <PortfolioGlyph />
              </Link>
              {viewer.walletAddress ? (
                <button
                  type="button"
                  onClick={shell.openWallet}
                  className="num hidden h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-1 px-4 text-[13px] font-medium text-text-primary transition-colors hover:border-border-strong xl:inline-flex"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  {shortAddress(viewer.walletAddress)}
                </button>
              ) : (
                <Button variant="secondary" size="md" className="hidden xl:inline-flex" onClick={shell.openWallet}>
                  Connect Wallet
                </Button>
              )}
              <button
                type="button"
                onClick={shell.openNotifications}
                aria-label="Notifications"
                className="relative grid h-11 w-11 place-items-center rounded-xl text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                <Bell size={20} aria-hidden="true" />
              </button>
              <UserMenu />
            </>
          ) : viewer.status === "loading" ? (
            <span className="h-11 w-24" aria-hidden="true" />
          ) : (
            <Button href="/login" variant="secondary" size="md">
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
