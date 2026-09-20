import type { Metadata } from "next";
import Link from "next/link";
import { KovaLockup } from "@/components/brand/kova-logo";

export const metadata: Metadata = {
  title: "Risk disclosure · Kova",
  description: "What you are exposed to when you play Predict and Trade tables on Kova.",
};

/**
 * DRAFT COPY: written from the product's actual behaviour for review. It is not
 * legal advice and has not been reviewed by counsel; a Terms of Service and a
 * Privacy Policy are still to be supplied and linked from the sign-in screen.
 */
const SECTIONS = [
  {
    heading: "Trade tables use real money",
    body: "In Trade mode every buy and sell is a real onchain transaction from your own capital. There is no paper trading or virtual balance. You can lose some or all of the capital you trade with, and the ANSEM you stake into the pot.",
  },
  {
    heading: "Your stake can be lost",
    body: "Every player stakes the same amount of ANSEM. The winner takes the pot. If you do not win, you lose your stake. Predict mode does not require you to buy the token you pick, but the stake is still at risk.",
  },
  {
    heading: "Winners are decided by rules, not by us",
    body: "Predict tables are scored by the percentage move of each locked pick between a common start and end price. Trade tables are ranked by net PnL percentage, not by dollars. Results are computed by deterministic rules, not by an AI model or an operator's discretion.",
  },
  {
    heading: "Meme stocks are volatile",
    body: "The markets on Kova are community-driven tokens that can move sharply, become illiquid, or go to zero. Prices can differ between the moment you decide and the moment a trade fills. Quotes are estimates and expire.",
  },
  {
    heading: "Picks are hidden until the showdown",
    body: "In Predict mode your pick is committed and kept private until the round ends. Trade activity may be visible on the Solana blockchain, which is public. Kova cannot promise anonymity for onchain transactions.",
  },
  {
    heading: "Data can be delayed or unavailable",
    body: "Market data, standings and balances come from third-party and onchain sources and may be delayed, stale or temporarily unavailable. Where data is not connected, Kova says so instead of showing a value.",
  },
  {
    heading: "You keep custody of your wallet",
    body: "Your account is your Kova identity. Your wallet is asked to approve an action only when that action moves money, and Kova does not hold your private keys.",
  },
  {
    heading: "No advice",
    body: "Nothing on Kova is financial, investment, legal or tax advice. Kova is entertainment built on real markets. Only stake and trade what you can afford to lose, and check that these products are permitted where you live.",
  },
];

export default function RiskPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-20">
      <Link href="/" aria-label="Kova home" className="inline-block">
        <KovaLockup />
      </Link>
      <h1 className="mb-3 mt-12 font-display text-[40px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[52px]">Risk disclosure</h1>
      <p className="mb-14 text-[13px] text-text-muted">Draft for review · last updated 19 September 2026</p>

      <div className="grid gap-10">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 font-display text-[20px] font-bold text-text-primary">{section.heading}</h2>
            <p className="text-[16px] leading-7 text-text-secondary">{section.body}</p>
          </section>
        ))}
      </div>

      <Link href="/markets" className="mt-16 inline-block text-[14px] font-medium text-[#b79bff] underline underline-offset-4">
        Browse markets
      </Link>
    </main>
  );
}
