import { ArrowRight, CandlestickChart, Eye, Swords, Trophy, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { KovaLockup } from "@/components/brand/kova-logo";
import { AuthProductPreview } from "@/components/auth/auth-product-preview";
import { SampleDataBanner } from "@/components/shell/sample-data-banner";
import { Button } from "@/components/ui/button";
import { LiveNow } from "@/features/competitions/live-now";
import { MemeStocksSection } from "@/features/markets/meme-stocks-section";

const STEPS = [
  { icon: Wallet, title: "Stake", body: "Every player puts the same amount of ANSEM into the pot." },
  { icon: Swords, title: "Play", body: "Lock a secret pick, or trade live. The clock is the same for everyone." },
  { icon: Trophy, title: "Showdown", body: "Best performance wins the pot. Your record follows you." },
] as const;

const MODES = [
  {
    href: "/play?mode=prediction",
    icon: Eye,
    title: "Predict",
    tag: "Make the better call.",
    points: ["Choose an eligible meme stock", "Lock it in secret", "Best percentage move wins"],
    tone: "text-[#c3a9ff] bg-accent-soft border-accent-line",
  },
  {
    href: "/play?mode=trading",
    icon: CandlestickChart,
    title: "Trade",
    tag: "Make the better trade.",
    points: ["Real trades, real market", "Live PnL against your opponent", "Highest net PnL % wins"],
    tone: "text-success bg-success-soft border-success/25",
  },
] as const;

/**
 * The marketing surface (blueprint section 4). Static copy plus two live
 * sections that carry their own loading, empty and error states. It mounts no
 * auth provider: guests read it, and every account action gates on click.
 */
export function LandingPage() {
  return (
    <div className="bg-bg text-text-primary">
      <SampleDataBanner />
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[var(--container-app)] items-center gap-6 px-4 md:px-8">
          <Link href="/" aria-label="Kova home">
            <KovaLockup />
          </Link>
          <nav aria-label="Public" className="ml-4 hidden items-center gap-1 md:flex">
            {[
              ["#how", "How it works"],
              ["/markets", "Markets"],
              ["/leaderboard", "Leaderboard"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg px-3.5 py-2 text-[15px] font-medium text-text-secondary transition-colors hover:text-text-primary">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <Button href="/login" variant="ghost" size="md" className="hidden sm:inline-flex">Sign in</Button>
            <Button href="/app" size="md" iconRight={<ArrowRight size={16} />}>Play now</Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_85%_20%,rgba(124,77,255,0.20),transparent_70%),radial-gradient(40%_50%_at_0%_100%,rgba(124,77,255,0.10),transparent_70%)] [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]"
          />
          <div className="relative mx-auto grid max-w-[var(--container-app)] grid-cols-1 items-center gap-10 px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[55fr_45fr] lg:gap-14">
            <div className="min-w-0">
              <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-text-muted">Trade&nbsp;&nbsp;/&nbsp;&nbsp;Play&nbsp;&nbsp;/&nbsp;&nbsp;Compete</p>
              <h1 className="font-display text-[46px] font-bold leading-[0.98] tracking-[-0.045em] md:text-[72px] xl:text-[88px]">
                Poker for
                <br />
                <span className="bg-linear-to-b from-[#cdb6ff] to-[#9b6cff] bg-clip-text text-transparent">Meme Stocks.</span>
              </h1>
              <p className="mt-6 max-w-[520px] text-[18px] leading-7 text-text-secondary md:text-[20px] md:leading-8">
                Predict the move or trade it live. Put your market skill against another player.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button href="/app" size="lg" iconRight={<ArrowRight size={17} />}>Play now</Button>
                <Button href="#how" size="lg" variant="secondary">See how it works</Button>
              </div>
            </div>

            <div className="relative min-h-[470px] min-w-0 md:min-h-[540px]">
              <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-[280px] w-[280px] opacity-80 md:right-6 md:h-[360px] md:w-[360px]">
                <Image src="/brand/kova-chip.jpg" alt="" width={760} height={760} priority className="h-full w-full object-contain mix-blend-screen [mask-image:radial-gradient(closest-side,#000_60%,transparent_100%)]" />
              </div>
              <AuthProductPreview className="absolute inset-x-0 bottom-0" />
            </div>
          </div>
        </section>

        {/* Two ways to play */}
        <section aria-labelledby="modes-title" className="mx-auto max-w-[var(--container-app)] px-4 py-14 md:px-8">
          <h2 id="modes-title" className="mb-8 font-display text-[32px] font-bold tracking-[-0.02em] md:text-[40px]">Two ways to play</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {MODES.map((mode) => (
              <Link key={mode.title} href={mode.href} className="group flex flex-col rounded-panel border border-border-subtle bg-surface-1 p-6 transition-colors hover:border-border-strong md:p-8">
                <span className={`grid h-12 w-12 place-items-center rounded-xl border ${mode.tone}`}><mode.icon size={24} aria-hidden="true" /></span>
                <h3 className="mt-5 font-display text-[30px] font-bold leading-9">{mode.title}</h3>
                <p className="text-[16px] text-text-secondary">{mode.tag}</p>
                <ul className="mt-5 space-y-2 text-[15px] text-text-secondary">
                  {mode.points.map((point) => (
                    <li key={point} className="flex items-center gap-2.5"><span className="h-1 w-1 rounded-full bg-text-muted" aria-hidden="true" />{point}</li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#b79bff] transition-colors group-hover:text-[#d0bdff]">
                  Play {mode.title} <ArrowRight size={15} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* How a table works */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[var(--container-app)] scroll-mt-24 px-4 py-14 md:px-8">
          <h2 id="how-title" className="mb-8 font-display text-[32px] font-bold tracking-[-0.02em] md:text-[40px]">How a table works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-panel border border-border-subtle bg-surface-1 p-6">
                <div className="flex items-center gap-3">
                  <span className="num grid h-8 w-8 place-items-center rounded-full border border-accent-line bg-accent-soft text-[13px] font-semibold text-[#c3a9ff]">{index + 1}</span>
                  <step.icon size={20} className="text-text-secondary" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-display text-[22px] font-bold">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-text-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Live competition */}
        <section className="mx-auto max-w-[var(--container-app)] px-4 py-14 md:px-8">
          <LiveNow limit={3} title="Live tables" />
        </section>

        {/* Meme stocks */}
        <section className="mx-auto max-w-[var(--container-app)] px-4 py-14 md:px-8">
          <MemeStocksSection />
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[var(--container-app)] px-4 pb-20 pt-6 md:px-8">
          <div className="relative overflow-hidden rounded-panel border border-border-subtle bg-surface-1 px-6 py-12 text-center md:py-16">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_120%,rgba(124,77,255,0.25),transparent_70%)]" />
            <h2 className="relative font-display text-[32px] font-bold tracking-[-0.02em] md:text-[44px]">Same markets. A more social game.</h2>
            <p className="relative mx-auto mt-3 max-w-[480px] text-[17px] text-text-secondary">Browse without an account. Sign in when you want to play.</p>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3">
              <Button href="/app" size="lg" iconRight={<ArrowRight size={17} />}>Play now</Button>
              <Button href="/markets" size="lg" variant="secondary">Browse markets</Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-[var(--container-app)] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <KovaLockup size="sm" />
            <p className="mt-3 max-w-[460px] text-[13px] leading-5 text-text-muted">
              Trade tables use real money, and stakes can be lost. Kova is not financial advice.{" "}
              <Link href="/legal/risk" className="text-text-secondary underline underline-offset-2 hover:text-text-primary">Read the risk disclosure</Link>.
            </p>
          </div>
          <p className="text-[12px] uppercase tracking-[0.2em] text-text-muted">Built on Solana · Markets from ClawPump / pump.fun</p>
        </div>
      </footer>
    </div>
  );
}
