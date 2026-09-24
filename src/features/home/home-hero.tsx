import { ArrowRight, Users } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

/**
 * The lobby's one moment of brand: `Poker for Meme Stocks.`, the chip, and the
 * two ways in. Desktop is a full hero; on mobile it becomes a compact card so
 * Live Now is visible without scrolling. Copy and CTAs only - no data.
 */
export function HomeHero() {
  return (
    <section
      aria-labelledby="home-title"
      className="relative overflow-hidden rounded-panel border border-border-subtle bg-surface-1 md:rounded-none md:border-0 md:bg-transparent"
    >
      {/* chip art */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-1/2 h-[190px] w-[190px] -translate-y-1/2 opacity-60 md:-right-4 md:h-[360px] md:w-[360px] md:opacity-95 xl:h-[400px] xl:w-[400px]">
        <Image
          src="/brand/kova-chip.jpg"
          alt=""
          width={760}
          height={760}
          priority
          className="h-full w-full object-contain mix-blend-screen [mask-image:radial-gradient(closest-side,#000_62%,transparent_100%)]"
        />
      </div>

      <div className="relative px-4 py-5 md:px-0 md:pb-4 md:pt-2">
        <p className="mb-3 hidden text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted md:block">
          Trade&nbsp;&nbsp;/&nbsp;&nbsp;Play&nbsp;&nbsp;/&nbsp;&nbsp;Compete&nbsp;&nbsp;/&nbsp;&nbsp;Together on Solana
        </p>
        <h1
          id="home-title"
          className="font-display text-[34px] font-bold leading-[0.98] tracking-[-0.04em] text-text-primary md:text-[64px] xl:text-[84px]"
        >
          Poker for
          <br />
          <span className="bg-linear-to-b from-[#cdb6ff] to-[#9b6cff] bg-clip-text text-transparent">Meme Stocks.</span>
        </h1>
        <p className="mt-3 max-w-[220px] text-[14px] leading-5 text-text-secondary md:mt-5 md:max-w-[520px] md:text-[20px] md:leading-7">
          Predict the move or trade it live. <span className="hidden md:inline">Compete with friends and the community using ANSEM as the stake chip.</span>
          <span className="md:hidden">Compete with friends on Solana.</span>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5 md:mt-6 md:gap-3">
          <Button href="/play" size="lg" iconRight={<ArrowRight size={17} />} className="max-md:h-10 max-md:px-4 max-md:text-[14px]">
            Play now
          </Button>
          <Button href="/play?intent=create-private" variant="secondary" size="lg" iconLeft={<Users size={17} />} className="max-md:h-10 max-md:px-4 max-md:text-[14px]">
            Challenge a friend
          </Button>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-2 hidden -rotate-6 font-script text-[30px] font-medium leading-[1.05] text-[#a57cff] 2xl:block"
      >
        Same Markets.
        <br />
        A More
        <br />
        Social Game.
      </p>
    </section>
  );
}
