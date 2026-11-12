"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KovaLockup } from "@/components/brand/kova-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CHIP_CONTRACT, nearNetwork, useNear } from "./near-session";
import { NEAR_HOME_PATH, NEAR_PLAY_PATH, NEAR_TOKEN_PATH } from "./paths";

/** On near.kova.surf the short paths are rewrites of the /near ones, so both count as the same page. */
const LINKS = [
  { href: `${NEAR_HOME_PATH}#how`, label: "How it works", match: [] as string[] },
  { href: NEAR_PLAY_PATH, label: "Play", match: [NEAR_PLAY_PATH, "/play"] },
  { href: NEAR_TOKEN_PATH, label: "Token", match: [NEAR_TOKEN_PATH, "/token"] },
];

export function NearHeader() {
  const near = useNear();
  const path = usePathname();
  const onPlay = path === NEAR_PLAY_PATH || path === "/play";
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[var(--container-app)] items-center gap-4 px-4 md:gap-6 md:px-8">
        <Link href={NEAR_HOME_PATH} aria-label="Kova on NEAR home" className="inline-flex items-center gap-2.5">
          <KovaLockup />
          <span className="whitespace-nowrap rounded-md border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c3a9ff]">on NEAR</span>
        </Link>
        <nav aria-label="NEAR mode" className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = l.match.includes(path);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-lg px-3.5 py-2 text-[15px] font-medium transition-colors", active ? "text-text-primary" : "text-text-secondary hover:text-text-primary")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2.5">
          {near.accountId ? <span className="hidden max-w-[220px] truncate text-[14px] text-text-secondary sm:inline">{near.accountId}</span> : null}
          {onPlay ? (
            <Link href={NEAR_TOKEN_PATH} className="rounded-lg px-3 py-2 text-[14px] font-medium text-text-secondary hover:text-text-primary md:hidden">
              Token
            </Link>
          ) : (
            <Button href={NEAR_PLAY_PATH} size="md" iconRight={<ArrowRight size={16} />}>
              <span className="sm:hidden">Play</span>
              <span className="hidden sm:inline">Play the House</span>
            </Button>
          )}
        </div>
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
