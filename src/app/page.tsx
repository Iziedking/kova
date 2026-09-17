import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/nav";
import { LandingHero } from "@/components/landing/hero";
import { LandingMarquee } from "@/components/landing/marquee";
import { LandingProblem } from "@/components/landing/problem";
import { LandingBoundaries } from "@/components/landing/boundaries";
import { LandingLoop } from "@/components/landing/loop";
import { LandingEvidence } from "@/components/landing/evidence-console";
import { LandingWhatYouGet } from "@/components/landing/what-you-get";
import { LandingFooter } from "@/components/landing/footer";
import { LandingEffects } from "@/components/landing/landing-effects";

export const metadata: Metadata = {
  title: "KOVA: Know the exit",
  description:
    "KOVA measures whether a stock-paired meme pool, and the stock token's exit path, can carry your capital before you commit it.",
};

/**
 * The advertisement surface. It reads no app data and requires no wallet; the
 * only live values it shows are the captured phase-00 constants, which are
 * unit-tested against the domain catalog.
 */
export default function LandingPage() {
  return (
    <>
      <LandingEffects />
      <LandingNav />
      <main>
        <LandingHero />
        <LandingMarquee />
        <LandingProblem />
        <LandingBoundaries />
        <LandingLoop />
        <LandingEvidence />
        <LandingWhatYouGet />
        <LandingFooter />
      </main>
    </>
  );
}
