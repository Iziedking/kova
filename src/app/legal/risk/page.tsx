import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Risk disclosure: KOVA",
  description: "What you are exposed to when you provide liquidity to a stock-paired meme market.",
};

const SECTIONS = [
  {
    heading: "KOVA is an early, read-only build",
    body: "Campaign creation, wallet signing, paid research, LP execution, rewards and automated management are not implemented. The scaffold refuses transaction preparation and reports these limits in its health response. Nothing here is a live trading or investment service.",
  },
  {
    heading: "You are exposed to both assets",
    body: "Providing concentrated liquidity to a pair means holding a changing mixture of both tokens. If the price moves, your position rebalances into the falling asset. This is not a hedged or principal-protected structure.",
  },
  {
    heading: "Fees and incentives are variable",
    body: "Trading fees depend on volume that may not occur. ANSEM incentives shown in the interface are project-proposed. Their mint, authority, funding and schedule are not verified, and a proposed incentive is not a funded one.",
  },
  {
    heading: "Captured data is not live data",
    body: "Market identities, pool depth and volume shown in this build are dated snapshots that carry their capture timestamp. Do not treat them as current market conditions.",
  },
  {
    heading: "Exit capacity is a measurement, not a promise",
    body: "The depth cross-section separates pool depth from measured stock exit depth. Measured capacity describes observed conditions at a point in time. It is not a guarantee that you can exit at a given size or price.",
  },
  {
    heading: "Unknown checks pause backing",
    body: "Where issuer approval, eligibility, jurisdiction coverage, reference pricing, redeemability or volatility have no independent source, KOVA reports them as unknown and does not present the market as reviewed.",
  },
  {
    heading: "You hold the authority",
    body: "Your wallet owns the Raydium position NFT and signs every open, collect, withdrawal and rebalance. KOVA cannot move your liquidity. Delegated signing is disabled.",
  },
  {
    heading: "No advice",
    body: "Nothing in this interface is financial, investment, legal or tax advice. Tokenized stock products carry issuer, jurisdiction and eligibility restrictions that may exclude you.",
  },
];

export default function RiskPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <Link href="/" className="font-mono text-[11px] tracking-[0.12em] text-muted transition-colors hover:text-ink">
        ← BACK
      </Link>

      <h1 className="mb-4 mt-12 font-display text-4xl font-bold text-ink md:text-5xl">Risk disclosure</h1>
      <p className="mb-16 font-mono text-[11px] tracking-[0.12em] text-faint">LAST UPDATED 17 SEPTEMBER 2026</p>

      <div className="grid gap-12">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-3 font-display text-xl font-bold text-ink">{section.heading}</h2>
            <p className="leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
