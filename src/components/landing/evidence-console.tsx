import { LANDING_EVIDENCE, LANDING_CAPTURE_LABEL, FEATURED_MARKET } from "@/design/landing-evidence";

/**
 * Where Rivet renders a fabricated terminal, this renders the real captured
 * readout. Every value comes from `landing-evidence.ts`, which is unit-tested
 * against MARKET_CATALOG so the advertisement cannot drift from the domain.
 */
export function LandingEvidence() {
  return (
    <section id="evidence" className="relative z-20 border-t border-line px-6 py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
        <div className="order-2 lg:order-1" data-reveal>
          <span className="mb-4 block font-mono text-[11px] tracking-[0.18em] text-accent">{"/// WHAT A READ LOOKS LIKE"}</span>
          <h2 className="mb-6 font-display text-4xl font-bold text-ink md:text-5xl">Real identity, or nothing</h2>
          <p className="mb-8 text-lg leading-relaxed text-muted">
            This is the actual finalized read of {FEATURED_MARKET.pair} recorded on 15 September 2026.
            It is a captured snapshot, not live market data, and KOVA labels it that way everywhere it
            appears.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Issuer approval, eligibility, jurisdiction, reference price, redeemability and volatility are
            deliberately absent. They have no independent source yet, so KOVA does not claim them.
          </p>
        </div>

        <div className="order-1 lg:order-2" data-reveal>
          <div className="rounded-lg border border-line bg-surface p-6 font-mono text-xs">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <span className="text-faint">{FEATURED_MARKET.pair}</span>
              <span className="text-faint">{LANDING_CAPTURE_LABEL}</span>
            </div>
            <dl className="grid gap-3">
              {LANDING_EVIDENCE.map((fact) => (
                <div key={fact.label} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-4">
                  <dt className="text-faint">{fact.label}</dt>
                  <dd className="break-all text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
