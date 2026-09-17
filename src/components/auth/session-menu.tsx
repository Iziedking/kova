"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";

function shorten(label: string): string {
  return label.length > 18 ? `${label.slice(0, 6)}…${label.slice(-4)}` : label;
}

/** Shows a sign-in affordance while signed out and a sign-out control once in. */
export function SessionMenu() {
  const { ready, authenticated, user, logout } = usePrivy();

  if (!ready) {
    return <span className="font-mono text-[10px] tracking-[0.12em] text-faint">CHECKING SESSION</span>;
  }

  if (!authenticated) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center border border-line-strong px-4 font-mono text-[11px] tracking-[0.12em] text-ink transition-colors hover:bg-elevated"
      >
        SIGN IN
      </Link>
    );
  }

  const identity = user?.email?.address ?? user?.wallet?.address ?? "SIGNED IN";

  return (
    <div className="flex items-center gap-3">
      <span className="hidden font-mono text-[10px] tracking-[0.12em] text-muted sm:inline">
        {shorten(identity)}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex min-h-11 items-center border border-line px-4 font-mono text-[11px] tracking-[0.12em] text-muted transition-colors hover:text-ink"
      >
        SIGN OUT
      </button>
    </div>
  );
}
