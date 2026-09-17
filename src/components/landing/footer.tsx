import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-bg px-6 pb-10 pt-32">
      <div className="pointer-events-none absolute bottom-0 left-0 w-full select-none leading-none opacity-[0.05]">
        <svg className="block w-full" viewBox="0 0 740 190" aria-hidden="true">
          <text
            x="0"
            y="188"
            fontSize="258"
            fontWeight="700"
            fill="#ffffff"
            textLength="740"
            lengthAdjust="spacingAndGlyphs"
            style={{ fontFamily: "var(--font-display)" }}
          >
            KOVA
          </text>
        </svg>
      </div>

      <div className="relative z-10 mx-auto flex max-w-[1400px] flex-col justify-between gap-12 md:flex-row md:items-end">
        <div>
          <h3 className="mb-6 font-display text-2xl font-bold text-ink">Read the market first.</h3>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center bg-accent px-6 py-3 font-mono text-xs font-bold tracking-[0.12em] text-accent-ink transition-colors hover:bg-accent-hi"
          >
            LAUNCH APP
          </Link>
        </div>

        <div className="flex gap-12 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          <div className="flex flex-col gap-3">
            <span className="text-ink">Product</span>
            <Link href="/markets" className="transition-colors hover:text-accent">
              Markets
            </Link>
            <a href="#loop" className="transition-colors hover:text-accent">
              The loop
            </a>
            <a href="#boundaries" className="transition-colors hover:text-accent">
              Boundaries
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-ink">Legal</span>
            <Link href="/legal/risk" className="transition-colors hover:text-accent">
              Risk
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-20 max-w-[1400px] border-t border-line pt-6">
        <p className="mb-4 max-w-4xl text-xs leading-relaxed text-muted">
          LP fees and incentives are variable. You remain exposed to both assets in the pair, to adverse
          selection and to loss. No principal or return is guaranteed. KOVA is an early, read-only build
          and is not a trading or investment service.{" "}
          <Link href="/legal/risk" className="text-accent underline">
            Full risk disclosure
          </Link>
        </p>
        <div className="flex flex-col justify-between gap-4 font-mono text-[10px] uppercase text-faint md:flex-row">
          <span>© 2026 KOVA</span>
          <span>SOLANA MAINNET · CAPTURED PREVIEW · SIGNING DISABLED</span>
        </div>
      </div>
    </footer>
  );
}
