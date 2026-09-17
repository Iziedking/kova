import { DepthCrossSection } from "@/components/market/depth-cross-section";
import { FEATURED_MARKET } from "@/design/landing-evidence";

const STEPS = [
  {
    title: "01. Identity",
    body: "The exact stock mint, token program, decimals and pool are read from Solana and shown in full. A brand badge never stands in for an address.",
  },
  {
    title: "02. Depth",
    body: "Pool depth and stock exit depth are measured separately. Where a source is missing, the check reports unknown instead of guessing.",
  },
  {
    title: "03. Authority",
    body: "You review capital, range, expiry and the exact mandate before a wallet is ever asked to sign. Every boundary is visible first.",
  },
];

export function LandingLoop() {
  return (
    <section id="loop" className="relative z-20 border-t border-line py-24">
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="order-2 lg:order-1">
            <div className="sticky top-24 rounded-2xl border border-line bg-surface p-6">
              <DepthCrossSection market={FEATURED_MARKET} variant="bare" idPrefix="loop-depth" />
            </div>
          </div>

          <div className="order-1 pb-0 lg:order-2 lg:py-20">
            <span className="mb-10 block font-mono text-[11px] tracking-[0.18em] text-accent">{"/// THE LOOP"}</span>
            {STEPS.map((step, i) => (
              <div key={step.title} className={i < STEPS.length - 1 ? "mb-24 md:mb-40" : ""} data-reveal>
                <h3 className="mb-4 font-display text-3xl font-bold text-ink md:text-4xl">{step.title}</h3>
                <p className="text-lg leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
