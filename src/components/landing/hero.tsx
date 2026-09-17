import { SmokeText } from "@/components/motion/smoke-text";
import { GradientButton, GhostButton } from "@/components/motion/gradient-button";
import { LatticeCanvas } from "@/components/background/lattice-canvas";

export function LandingHero() {
  return (
    <section className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden pt-20">
      <div className="absolute inset-0">
        <LatticeCanvas />
      </div>

      {/* A cool bloom behind the headline, so the type sits in light rather than on flat black. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 animate-drift rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-brand-cyan) 26%, transparent) 0%, color-mix(in oklab, var(--color-brand-indigo) 13%, transparent) 38%, transparent 66%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg" />

      <div className="relative z-20 max-w-5xl px-6 py-12 text-center">
        <span className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-line bg-surface/70 px-4 py-1.5 font-mono text-[10px] tracking-[0.18em] text-brand-cyan backdrop-blur-sm">
          <span className="h-1 w-1 rounded-full bg-brand-cyan" aria-hidden="true" />
          SOLANA · RAYDIUM CLMM · YOU OWN THE POSITION
        </span>

        <h1 className="mb-7 font-display text-[clamp(46px,13.5vw,124px)] font-bold leading-[0.86] tracking-[-0.045em] text-ink">
          <SmokeText delay={120} className="block">
            KNOW THE
          </SmokeText>
          <SmokeText delay={420} duration={1900} className="kova-gradient-text block">
            EXIT
          </SmokeText>
        </h1>

        <p
          className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
          data-reveal
          style={{ "--i": 4 } as React.CSSProperties}
        >
          Stock-paired meme markets need liquidity. KOVA measures whether the pool, and the stock
          token&rsquo;s exit path, can carry your capital before you commit it.
        </p>

        <div
          className="flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row"
          data-reveal
          style={{ "--i": 5 } as React.CSSProperties}
        >
          <GradientButton href="/login">LAUNCH APP</GradientButton>
          <GhostButton href="#evidence">SEE HOW IT READS A MARKET</GhostButton>
        </div>
      </div>
    </section>
  );
}
