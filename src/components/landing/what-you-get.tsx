import type { CSSProperties } from "react";
import Link from "next/link";

const CARDS = [
  {
    kicker: "/ BACKER",
    headline: "Your position",
    note: "owned by your wallet",
    points: [
      "Raydium CLMM position NFT minted to you",
      "Capital, range and expiry set before any signature",
    ],
    cta: { label: "BROWSE MARKETS", href: "/markets" },
    feature: false,
  },
  {
    kicker: "/ EVIDENCE",
    headline: "Five gates",
    note: "with the unknowns named",
    points: [
      "Exact mint, token program and decimals",
      "Pool depth and stock exit depth, measured apart",
    ],
    cta: { label: "SEE A READ", href: "#evidence" },
    feature: true,
  },
  {
    kicker: "/ CREATOR",
    headline: "One campaign",
    note: "with a funding proof",
    points: [
      "Pool and authority verified before listing",
      "ANSEM incentive scope stated, never assumed",
    ],
    cta: { label: "HOW IT WORKS", href: "#loop" },
    feature: false,
  },
];

export function LandingWhatYouGet() {
  return (
    <section className="relative z-20 border-t border-line px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-16 text-center font-display text-4xl font-bold text-ink">What you get</h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {CARDS.map((card, i) => (
            <div
              key={card.kicker}
              className={`kova-lift rounded-2xl border p-8 ${
                card.feature ? "border-brand-cyan bg-elevated md:mt-[-1rem]" : "border-line bg-surface"
              }`}
            >
              <div data-reveal style={{ "--i": i } as CSSProperties}>
                <div
                  className={`mb-4 font-mono text-[11px] tracking-[0.12em] ${
                    card.feature ? "text-accent" : "text-faint"
                  }`}
                >
                  {card.kicker}
                </div>
                <div className="mb-6 font-display text-3xl font-bold text-ink">
                  {card.headline}
                  <span className="block text-sm font-normal text-muted">{card.note}</span>
                </div>
                <ul className="mb-8 grid gap-4 font-mono text-[13px] leading-relaxed text-muted">
                  {card.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span aria-hidden="true" className={card.feature ? "text-accent" : "text-faint"}>
                        +
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={card.cta.href}
                  className={`flex min-h-11 w-full items-center justify-center py-3 font-mono text-[11px] font-bold tracking-[0.12em] transition-colors ${
                    card.feature
                      ? "bg-accent text-accent-ink hover:bg-accent-hi"
                      : "border border-line-strong text-ink hover:bg-elevated"
                  }`}
                >
                  {card.cta.label}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
