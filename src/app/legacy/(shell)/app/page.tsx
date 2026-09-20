import type { Metadata } from "next";
import { PageTitle } from "@/components/legacy-shell/page-title";
import { CapabilityPanel } from "@/components/legacy-app/capability-panel";
import { NextAction } from "@/components/legacy-app/next-action";
import { getSession } from "@/auth/session";

export const metadata: Metadata = {
  title: "Home: KOVA",
  description: "What KOVA does, what it can do today, and the next step to take.",
};

const MODEL = [
  {
    step: "01",
    title: "Identity",
    body: "The exact stock mint, token program, decimals and pool are read from Solana and shown in full.",
  },
  {
    step: "02",
    title: "Depth",
    body: "Pool depth and stock exit depth are measured separately, and unknown checks pause backing.",
  },
  {
    step: "03",
    title: "Authority",
    body: "You review capital, range, expiry and the exact mandate before any wallet is asked to sign.",
  },
];

export default async function AppHome() {
  const session = await getSession();

  return (
    <>
      <PageTitle
        kicker={"/// YOU ARE HERE"}
        title="Back stock-paired liquidity, with the evidence in front of you."
        lede="KOVA is a marketplace for backing stock-paired meme liquidity. It measures whether a pool, and the stock token's exit path, can carry your capital before you commit it. You own the position and sign every move."
      />

      <div className="grid gap-6">
        <NextAction signedIn={session !== null} />

        <section aria-labelledby="model-title" className="rounded-xl border border-line bg-surface p-8">
          <span className="mb-3 block font-mono text-[11px] tracking-[0.18em] text-accent">{"/// THE MODEL"}</span>
          <h2 id="model-title" className="mb-8 font-display text-xl font-bold text-ink">
            How a market gets reviewed
          </h2>
          <ol className="grid gap-8 md:grid-cols-3">
            {MODEL.map((item) => (
              <li key={item.step}>
                <span className="mb-3 block font-mono text-[11px] tracking-[0.12em] text-faint">{item.step}</span>
                <h3 className="mb-2 font-display text-lg font-bold text-ink">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <CapabilityPanel />
      </div>
    </>
  );
}
