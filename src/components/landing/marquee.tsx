const STACK = ["RAYDIUM CLMM", "TOKEN-2022", "SOLANA RPC", "WALLET STANDARD", "PRIVY", "xSTOCKS", "ANSEM"];

/** The real stack, not a claim. Decorative only; duplicates are hidden from AT. */
export function LandingMarquee() {
  return (
    <div className="kova-marquee-mask relative z-20 w-full overflow-hidden border-y border-line bg-surface py-8">
      <div className="flex w-max animate-marquee whitespace-nowrap">
        {[0, 1, 2].map((copy) => (
          <div key={copy} className="flex items-center gap-12 px-6 md:gap-20 md:px-10" aria-hidden={copy > 0}>
            {STACK.map((name) => (
              <span key={name} className="font-display text-xl font-bold text-ink/30 md:text-2xl">
                {name}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
