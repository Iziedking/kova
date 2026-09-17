import type { CSSProperties } from "react";
import { SmokeText } from "@/components/motion/smoke-text";
import { StaticField } from "@/components/background/static-field";

/**
 * Rivet's guarantee bento, retuned. KOVA's honesty constraints are the product,
 * so the strongest advertisement is the list of things it refuses to do.
 */
const COMMITMENTS = [
  {
    title: "You own the position NFT",
    body: "KOVA never holds your liquidity. The Raydium position is minted to your wallet and stays there. Open, collect, withdraw and rebalance each require your signature.",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    title: "The exact mint is always visible",
    body: "A ticker is not an identity. Every surface shows the full address, token program and decimals.",
    span: "",
  },
  {
    title: "Unknown is a state",
    body: "Not a grey score. If a check has no independent source, it says so and backing pauses.",
    span: "",
  },
  {
    title: "Incentives never buy a rating",
    body: "A funded campaign changes the reward on offer, never the underwriting result.",
    span: "",
  },
  {
    title: "Captured data says it is captured",
    body: "Snapshots carry their capture time next to the value. A dated read is never presented as a live market.",
    span: "md:col-span-2",
  },
];

export function LandingBoundaries() {
  return (
    <section id="boundaries" className="relative z-20 border-t border-line px-6 py-24 md:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 border-b border-line pb-8" data-reveal>
          <span className="mb-2 block font-mono text-[11px] tracking-[0.18em] text-accent">{"/// THE BOUNDARIES"}</span>
          <h2 className="font-display text-4xl font-bold text-ink md:text-5xl">
            <SmokeText>What KOVA will not do</SmokeText>
          </h2>
        </div>

        {/* The five cards tile a 3x3 grid exactly: 2x2 + 1 + 1 + 1 + 2x1.
            The explicit row count and height matter, because with auto rows the
            browser sizes each row to its content and `row-span-2` leaves a gap. */}
        <div className="grid grid-cols-1 gap-6 md:h-[720px] md:grid-cols-3 md:grid-rows-3">
          {COMMITMENTS.map((item, i) => (
            <div
              key={item.title}
              className={`kova-lift flex flex-col justify-end overflow-hidden rounded-xl border border-line bg-surface p-8 ${item.span}`}
            >
              {i === 0 ? <StaticField className="opacity-70" /> : null}
              <div className="relative" data-reveal style={{ "--i": i } as CSSProperties}>
                <div className="mb-5 flex items-center gap-3" aria-hidden="true">
                  <span className="kova-gradient-text font-mono text-[11px] font-bold tracking-[0.12em]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="kova-gradient-rule h-px w-10 opacity-70" />
                </div>
                <h3 className="mb-2 font-display text-xl font-bold text-ink">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
