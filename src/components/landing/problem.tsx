import type { CSSProperties } from "react";
import { DepthCrossSection } from "@/components/market/depth-cross-section";
import { SmokeText } from "@/components/motion/smoke-text";
import { FEATURED_MARKET } from "@/design/landing-evidence";

/**
 * KOVA's own section. Rivet has no equivalent, and the product's entire argument
 * rests on this distinction.
 */
export function LandingProblem() {
  return (
    <section id="problem" className="relative z-20 border-t border-line px-6 py-24 md:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:gap-20">
        <div data-reveal>
          <span className="mb-2 block font-mono text-[11px] tracking-[0.18em] text-accent">{"/// THE PROBLEM"}</span>
          <h2 className="mb-6 font-display text-4xl font-bold text-ink md:text-5xl">
            <SmokeText>TVL is not exit depth.</SmokeText>
          </h2>
          <p className="mb-4 text-lg leading-relaxed text-muted">
            A pool can hold millions and still refuse to let you out. What matters is how much the
            stock side can actually absorb when you withdraw, at a price you would accept.
          </p>
          <p className="text-lg leading-relaxed text-muted">
            KOVA measures that separately from pool depth, labels both, and says so plainly when the
            measurement is incomplete.
          </p>
        </div>
        <div data-reveal style={{ "--i": 1 } as CSSProperties}>
          <DepthCrossSection market={FEATURED_MARKET} idPrefix="problem-depth" />
        </div>
      </div>
    </section>
  );
}
