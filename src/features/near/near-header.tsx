"use client";

/**
 * The NEAR app's navigation. One page per job: Play, Tables, Launches, Clans, Leaderboard, Token.
 * The right side is always the player: "Sign in", or their CHIP balance, linking to /account.
 * On phones the jobs move to a bottom tab bar, the way the Solana app does it.
 */
import { Crown, Flag, LayoutList, Rocket, Swords, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatChip } from "@/adapters/near/chip";
import { displayAccount } from "@/adapters/near/leaderboard";
import { KovaLockup } from "@/components/brand/kova-logo";
import { cn } from "@/lib/cn";
import { CHIP_CONTRACT, nearNetwork } from "./near-session";
import { NEAR_ACCOUNT_PATH, NEAR_CLANS_PATH, NEAR_HOME_PATH, NEAR_LAUNCHES_PATH, NEAR_LEADERBOARD_PATH, NEAR_PLAY_PATH, NEAR_TABLES_PATH, NEAR_TOKEN_PATH } from "./paths";
import { usePlayer } from "./use-player";

type Item = { href: string; label: string; short: string; icon: typeof Swords; match: string[] };

const ITEMS: Item[] = [
  { href: NEAR_PLAY_PATH, label: "Play", short: "Play", icon: Swords, match: ["/play"] },
  { href: NEAR_TABLES_PATH, label: "Tables", short: "Tables", icon: LayoutList, match: ["/tables", "/t/"] },
  { href: NEAR_LAUNCHES_PATH, label: "Launches", short: "Launches", icon: Rocket, match: ["/launches"] },
  { href: NEAR_CLANS_PATH, label: "Clans", short: "Clans", icon: Flag, match: ["/clans", "/c/"] },
  { href: NEAR_LEADERBOARD_PATH, label: "Leaderboard", short: "Ranks", icon: Crown, match: ["/leaderboard"] },
];

/** Paths arrive as "/play" on near.kova.surf (a rewrite) and as "/near/play" elsewhere. */
function isActive(path: string, item: Item) {
  const bare = path.replace(/^\/near(?=\/|$)/, "") || "/";
  return item.match.some((m) => (m.endsWith("/") ? bare.startsWith(m) : bare === m));
}

function AccountChip() {
  const player = usePlayer();
  const path = usePathname();
  const active = /\/account$/.test(path);
  if (!player.accountId) {
    return (
      <Link href={NEAR_ACCOUNT_PATH} className={cn("inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[14px] font-semibold", active ? "border-accent bg-accent-soft text-text-primary" : "border-border-strong text-text-primary hover:border-accent")}>
        <UserRound size={15} aria-hidden="true" /> Sign in
      </Link>
    );
  }
  return (
    <Link
      href={NEAR_ACCOUNT_PATH}
      aria-label={`Your account, ${displayAccount(player.accountId)}`}
      className={cn("inline-flex h-10 min-w-0 items-center gap-2 rounded-lg border px-3 text-[14px]", active ? "border-accent bg-accent-soft" : "border-border-subtle hover:border-border-strong")}
    >
      <span className="num font-semibold text-text-primary">{player.balance !== null ? `${formatChip(player.balance)} CHIP` : "…"}</span>
      <span className="hidden max-w-[120px] truncate text-text-muted sm:inline">{displayAccount(player.accountId)}</span>
    </Link>
  );
}

export function NearHeader() {
  const path = usePathname();
  const tokenActive = /\/token$/.test(path);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[var(--container-app)] items-center gap-4 px-4 md:px-8">
          <Link href={NEAR_HOME_PATH} aria-label="Kova on NEAR home" className="inline-flex shrink-0 items-center gap-2.5">
            <KovaLockup />
            <span className="whitespace-nowrap rounded-md border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c3a9ff]">on NEAR</span>
          </Link>
          <nav aria-label="Kova on NEAR" className="ml-2 hidden items-center gap-1 lg:flex">
            {[...ITEMS, { href: NEAR_TOKEN_PATH, label: "Token", short: "Token", icon: Swords, match: ["/token"] }].map((item) => {
              const active = isActive(path, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("rounded-lg px-3 py-2 text-[15px] font-medium transition-colors", active ? "bg-surface-2 text-text-primary" : "text-text-secondary hover:text-text-primary")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Link href={NEAR_TOKEN_PATH} aria-current={tokenActive ? "page" : undefined} className={cn("rounded-lg px-2.5 py-2 text-[14px] font-medium lg:hidden", tokenActive ? "text-text-primary" : "text-text-secondary hover:text-text-primary")}>
              Token
            </Link>
            <AccountChip />
          </div>
        </div>
        <p className="border-t border-border-subtle bg-warning-soft px-4 py-1.5 text-center text-[12px] text-warning">
          NEAR testnet. CHIP has no value. Contract{" "}
          <a className="underline" href={nearNetwork.explorerAccount(CHIP_CONTRACT)} target="_blank" rel="noreferrer">
            {CHIP_CONTRACT}
          </a>
        </p>
      </header>

      <nav aria-label="Kova on NEAR" className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-[560px] grid-cols-5">
          {ITEMS.map((item) => {
            const active = isActive(path, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-text-primary" : "text-text-muted hover:text-text-secondary")}>
                  <Icon size={20} aria-hidden="true" className={active ? "text-[#b79bff]" : undefined} />
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
