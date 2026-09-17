"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { useReducedMotion } from "@/components/motion/reduced-motion";
import { LENIS_LERP } from "@/design/motion";

/**
 * Smooth scroll, landing only. Spec section 5 keeps it off the app, where it
 * fights a reader scanning figures.
 *
 * Rivet's scroll-velocity skew used to run here too. It was removed: shearing
 * the page is one of Rivet's most recognisable tics, and KOVA's motion identity
 * is the smoke materialise instead.
 */
export function LandingEffects() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;

    const lenis = new Lenis({ lerp: LENIS_LERP });
    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduced]);

  return null;
}
