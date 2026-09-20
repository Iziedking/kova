"use client";

import { Bell, ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useViewer } from "@/features/auth/viewer";
import { KovaLockup } from "@/components/brand/kova-logo";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Button } from "@/components/ui/button";
import { useShell } from "./shell-context";

/** Default mobile top bar: Kova mark, search, notifications and avatar (56px). */
export function MobileHeader() {
  const viewer = useViewer();
  const shell = useShell();
  const authed = viewer.status === "authed";
  return (
    <header className="sticky top-0 z-40 flex h-[var(--spacing-mobile-header)] items-center justify-between border-b border-border-subtle bg-bg/95 px-4 backdrop-blur-md md:hidden">
      <Link href="/app" aria-label="Kova home">
        <KovaLockup size="sm" />
      </Link>
      <div className="flex items-center gap-1">
        <button type="button" onClick={shell.openSearch} aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full text-text-primary">
          <Search size={20} aria-hidden="true" />
        </button>
        {authed ? (
          <>
            <button type="button" onClick={shell.openNotifications} aria-label="Notifications" className="grid h-10 w-10 place-items-center rounded-full text-text-primary">
              <Bell size={20} aria-hidden="true" />
            </button>
            <Link href={`/profile/${encodeURIComponent(viewer.identity?.username ?? "me")}`} aria-label="Your profile" className="ml-1">
              <PlayerAvatar username={viewer.identity?.username ?? "you"} src={viewer.identity?.avatarUrl} size="sm" />
            </Link>
          </>
        ) : viewer.status === "guest" ? (
          <Button href="/login" variant="secondary" size="sm" className="ml-1">
            Sign in
          </Button>
        ) : null}
      </div>
    </header>
  );
}

/**
 * A contextual mobile top bar for detail screens (trading match, result,
 * market): back, centred title with optional status, and right actions.
 * Pages that render this set `hideDefaultMobileHeader` semantics by path in the shell.
 */
export function MobileTopBar({
  title,
  status,
  backHref,
  right,
  className,
}: {
  title: string;
  status?: ReactNode;
  backHref: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-40 grid h-[var(--spacing-mobile-header)] grid-cols-[44px_1fr_auto] items-center border-b border-border-subtle bg-bg/95 px-2 backdrop-blur-md md:hidden",
        className,
      )}
    >
      <Link href={backHref} aria-label="Back" className="grid h-11 w-11 place-items-center text-text-primary">
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      <div className="flex min-w-0 items-center justify-center gap-2">
        <h1 className="truncate text-[16px] font-semibold text-text-primary">{title}</h1>
        {status}
      </div>
      <div className="flex min-w-[44px] items-center justify-end gap-1 pr-1">{right}</div>
    </div>
  );
}
