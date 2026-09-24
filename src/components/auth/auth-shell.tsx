import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { KovaLockup } from "@/components/brand/kova-logo";
import { AuthProductPreview, BrowseFirstLink } from "./auth-product-preview";

const NAV = [
  { href: "/app", label: "Home" },
  { href: "/markets", label: "Markets" },
  { href: "/play", label: "Play" },
  { href: "/leaderboard", label: "Leaderboard" },
];

/**
 * The auth layout: a 55/45 split on desktop (product on the left, a quiet form
 * on the right) and a single, product-aware column on mobile with the controls
 * inside the first viewport (blueprint 44.7-44.9).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-bg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_8%_100%,rgba(124,77,255,0.22),transparent_72%),radial-gradient(35%_30%_at_95%_0%,rgba(124,77,255,0.07),transparent_70%)]"
      />

      {/* Desktop: minimal public navigation */}
      <header className="relative z-10 hidden h-[var(--spacing-header)] items-center border-b border-border-subtle lg:flex">
        <div className="mx-auto flex w-full max-w-[var(--container-trading)] items-center gap-8 px-8">
          <Link href="/" aria-label="Kova home">
            <KovaLockup />
          </Link>
          <nav aria-label="Public" className="flex items-center gap-2">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3.5 py-2 text-[15px] font-medium text-text-secondary transition-colors hover:text-text-primary">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/markets"
            aria-label="Search markets, players, or tables"
            className="mx-auto flex h-11 w-full max-w-[420px] items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-[14px] text-text-muted transition-colors hover:border-border-strong"
          >
            <Search size={17} aria-hidden="true" />
            Search markets, players, or tables…
          </Link>
          <span aria-current="page" className="inline-flex h-11 items-center rounded-button border border-border-strong px-5 text-[14px] font-semibold text-text-primary">
            Sign in
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[var(--container-trading)] gap-8 px-4 pb-10 pt-6 lg:min-h-[calc(100dvh-var(--spacing-header))] lg:grid-cols-[55fr_45fr] lg:items-center lg:gap-14 lg:px-8 lg:py-10">
        {/* Product side */}
        <section aria-label="What Kova is" className="order-2 hidden lg:order-1 lg:block">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-text-muted">
            Trade&nbsp;&nbsp;/&nbsp;&nbsp;Play&nbsp;&nbsp;/&nbsp;&nbsp;Compete&nbsp;&nbsp;/&nbsp;&nbsp;Together on Solana
          </p>
          <p className="font-display text-[clamp(56px,6.4vw,92px)] font-bold leading-[0.92] tracking-[-0.045em] text-text-primary" role="presentation">
            Play markets
            <br />
            <span className="bg-linear-to-b from-[#c9b0ff] to-[#9b6cff] bg-clip-text text-transparent">together.</span>
          </p>
          <p className="mt-6 text-[20px] leading-7 text-text-secondary">Predict the move. Trade it live. Build your record.</p>

          <AuthProductPreview className="mt-9 max-w-[640px]" />

          <div className="relative mt-12 flex items-end gap-10">
            <p
              aria-hidden="true"
              className="-rotate-6 font-script text-[34px] font-medium leading-[1.05] text-[#a57cff]"
            >
              Same Markets.
              <br />
              A More
              <br />
              Social Game.
            </p>
          </div>
          <BrowseFirstLink className="mt-8" />
        </section>

        {/* Auth side */}
        <div className="order-1 mx-auto w-full max-w-[var(--container-auth)] lg:order-2 lg:max-w-[520px] lg:justify-self-center">
          <div className="mb-5 flex justify-center lg:hidden">
            <Link href="/" aria-label="Kova home">
              <KovaLockup size="md" />
            </Link>
          </div>
          <AuthProductPreview compact className="mb-6 lg:hidden" />
          <div className="lg:rounded-panel lg:border lg:border-border-subtle lg:bg-surface-1/80 lg:p-10 lg:backdrop-blur-sm">{children}</div>
          <div className="mt-6 flex justify-center lg:hidden">
            <BrowseFirstLink label="Browse markets first" />
          </div>
        </div>
      </main>
    </div>
  );
}
