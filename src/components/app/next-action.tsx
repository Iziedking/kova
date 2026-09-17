import Link from "next/link";
import { FEATURED_MARKET } from "@/design/landing-evidence";

/**
 * One action, chosen from session state. Spec section 8.3: the home page is an
 * orientation surface, not a dashboard, so it offers exactly one next step.
 *
 * The dossier still lives at `/markets/[id]`. It moves under `/app/markets` in
 * the next plan, and this link moves with it. It must always resolve.
 */
export function NextAction({ signedIn }: { signedIn: boolean }) {
  const action = signedIn
    ? {
        kicker: "/// YOUR NEXT STEP",
        title: "Review a market before you back it.",
        body: `Open the ${FEATURED_MARKET.pair} dossier to see the exact pool identity, the five Initial StockCheck gates, and what is still unknown.`,
      }
    : {
        kicker: "/// START HERE",
        title: "Read a market without an account.",
        body: `Market evidence is open to everyone. Open the ${FEATURED_MARKET.pair} dossier first, and sign in only when you want to back a market.`,
      };

  return (
    <section className="rounded-xl border border-accent bg-elevated p-8">
      <span className="mb-3 block font-mono text-[11px] tracking-[0.18em] text-accent">{action.kicker}</span>
      <h2 className="mb-3 font-display text-2xl font-bold text-ink">{action.title}</h2>
      <p className="mb-8 max-w-2xl leading-relaxed text-muted">{action.body}</p>
      <Link
        href={`/markets/${FEATURED_MARKET.id}`}
        className="inline-flex min-h-11 items-center bg-accent px-6 font-mono text-xs font-bold tracking-[0.12em] text-accent-ink transition-colors hover:bg-accent-hi"
      >
        OPEN THE DOSSIER
      </Link>
    </section>
  );
}
