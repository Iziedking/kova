"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CHIP_CONTRACT, nearNetwork, useNear } from "./near-session";

export function NearHeader() {
  const near = useNear();
  const path = usePathname();
  const links = [
    { href: "/near", label: "Play" },
    { href: "/near/token", label: "Token" },
  ];
  return (
    <header className="border-b border-border-subtle bg-surface-1/80">
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center gap-4 px-4 sm:px-6">
        <Link href="/near" className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
          Kova <span className="text-text-muted">on NEAR</span>
        </Link>
        <nav aria-label="NEAR mode" className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href || (l.href === "/near" && path === "/") ? "page" : undefined}
              className={cn("rounded-lg px-3 py-2 text-[14px] font-medium", path === l.href ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary")}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto truncate text-[13px] text-text-secondary">{near.accountId ?? (near.status === "loading" ? "" : "Not signed in")}</div>
      </div>
      <p className="border-t border-border-subtle bg-warning-soft px-4 py-1.5 text-center text-[12px] text-warning">
        NEAR testnet. CHIP has no value. Contract{" "}
        <a className="underline" href={nearNetwork.explorerAccount(CHIP_CONTRACT)} target="_blank" rel="noreferrer">
          {CHIP_CONTRACT}
        </a>
      </p>
    </header>
  );
}
