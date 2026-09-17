"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useReducedMotion } from "./reduced-motion";

/**
 * KOVA's signature reveal: the words condense out of vapour.
 *
 * An SVG turbulence field displaces the glyphs and a blur disperses them; both
 * resolve to zero, so the text appears to form from smoke rather than fade in.
 * This replaces the character scramble, which is a Rivet signature and is also
 * forbidden on anything carrying a value.
 *
 * Degradation is deliberate. The markup renders crisp, fully opaque text with no
 * filter, and the effect is only ever applied from the client effect. If the
 * script never runs, if the browser drops the filter, or if the viewer prefers
 * reduced motion, the headline is simply there. The filter is also removed once
 * the animation settles, so resting text is never rasterised through a filter.
 */
export function SmokeText({
  children,
  delay = 0,
  duration = 1700,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const rawId = useId();
  const filterId = `smoke-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const hostRef = useRef<HTMLSpanElement>(null);
  const turbulenceRef = useRef<SVGFETurbulenceElement>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host || reduced) return;

    const SCALE = 150;
    const BLUR = 10;
    // Cubic ease-out: most of the dispersal clears early, then it settles.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    let raf = 0;
    let startedAt = 0;

    host.style.filter = `url(#${filterId})`;
    host.style.opacity = "0";

    const frame = (now: number) => {
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt - delay;

      if (elapsed < 0) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const t = Math.min(1, elapsed / duration);
      const settled = ease(t);
      const remaining = 1 - settled;

      displacementRef.current?.setAttribute("scale", (SCALE * remaining).toFixed(2));
      blurRef.current?.setAttribute("stdDeviation", (BLUR * remaining).toFixed(2));
      // The field coarsens as it clears, so the vapour reads as billowing.
      turbulenceRef.current?.setAttribute(
        "baseFrequency",
        `${(0.007 + 0.022 * remaining).toFixed(4)} ${(0.018 + 0.05 * remaining).toFixed(4)}`,
      );
      host.style.opacity = Math.min(1, settled * 1.4).toFixed(3);

      if (t < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }

      // Resting text must not stay behind a filter, or it renders soft forever.
      host.style.filter = "none";
      host.style.opacity = "1";
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      host.style.filter = "none";
      host.style.opacity = "1";
    };
  }, [reduced, delay, duration, filterId]);

  return (
    <>
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          {/* A generous region, or the dispersed glyphs are clipped mid-animation. */}
          <filter id={filterId} x="-30%" y="-45%" width="160%" height="190%" colorInterpolationFilters="sRGB">
            <feTurbulence
              ref={turbulenceRef}
              type="fractalNoise"
              baseFrequency="0.029 0.068"
              numOctaves="2"
              seed="7"
              result="vapour"
            />
            <feDisplacementMap
              ref={displacementRef}
              in="SourceGraphic"
              in2="vapour"
              scale="150"
              xChannelSelector="R"
              yChannelSelector="G"
              result="dispersed"
            />
            <feGaussianBlur ref={blurRef} in="dispersed" stdDeviation="10" />
          </filter>
        </defs>
      </svg>

      <span ref={hostRef} className={`kova-smoke ${className}`}>
        {children}
      </span>
    </>
  );
}
