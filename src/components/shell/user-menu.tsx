"use client";

import { ChevronDown, LogOut, Settings, User, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useViewer } from "@/features/auth/viewer";
import { PlayerAvatar } from "@/components/social/player-avatar";

/** Avatar + chevron opening the account menu: profile, portfolio, settings, sign out. */
export function UserMenu() {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const username = viewer.identity?.username ?? viewer.prefill.username ?? "you";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-surface-2"
      >
        <PlayerAvatar username={username} src={viewer.identity?.avatarUrl} size="md" />
        <ChevronDown size={16} className={cn("text-text-secondary transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-border-strong bg-surface-1 p-1.5 shadow-popover animate-rise-in"
        >
          <p className="truncate px-3 pb-2 pt-1.5 text-[13px] text-text-secondary">@{username}</p>
          {[
            { href: `/profile/${encodeURIComponent(username)}`, label: "Your profile", icon: User },
            { href: "/portfolio", label: "Portfolio", icon: Wallet },
            { href: "/settings", label: "Settings", icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] text-text-primary transition-colors hover:bg-surface-3"
            >
              <Icon size={16} className="text-text-secondary" aria-hidden="true" />
              {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void viewer.logout();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] text-text-primary transition-colors hover:bg-surface-3"
          >
            <LogOut size={16} className="text-text-secondary" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
