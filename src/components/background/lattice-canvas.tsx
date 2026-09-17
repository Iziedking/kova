"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/components/motion/reduced-motion";
import {
  buildLattice,
  depthCurve,
  proximityBoost,
  sweepX,
  LATTICE_GAP,
  LATTICE_REACH,
  SWEEP_PERIOD_MS,
  type LatticeNode,
} from "@/design/lattice";

const NEAR = "91,200,224";
/**
 * Bright enough to read against the #05070B substrate. At the original
 * 90,90,100 / 0.14 the resting field was invisible and only the sweep showed.
 */
const BASE = "116,130,152";
const BASE_ALPHA = 0.2;
const AMPLITUDE = 26;
const SWEEP_WIDTH = 90;

/**
 * The landing liquidity lattice. A 2D canvas, no WebGL: a node grid whose
 * vertical offset traces a depth curve, brightening and lifting toward the
 * pointer, with a slow brand-cyan sweep. Spec section 6.1.
 *
 * Under reduced motion it paints exactly one static frame and registers no
 * pointer listener and no animation loop.
 */
export function LatticeCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let nodes: LatticeNode[] = [];
    let pointerX = -9999;
    let pointerY = -9999;
    let frame = 0;
    let visible = true;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = buildLattice(width, height, LATTICE_GAP);
    };

    const paint = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const sweep = reduced ? -1 : sweepX(time, width, SWEEP_PERIOD_MS);

      for (const node of nodes) {
        const depth = depthCurve(node.x, width, AMPLITUDE);
        const bob = reduced ? 0 : Math.sin(time / 1400 + node.phase) * 1.1;
        const y = node.y + depth + bob;
        const boost = reduced ? 0 : proximityBoost(node.x - pointerX, y - pointerY, LATTICE_REACH);
        const nearSweep = sweep < 0 ? 0 : Math.max(0, 1 - Math.abs(node.x - sweep) / SWEEP_WIDTH);
        const lift = Math.max(boost, nearSweep * 0.55);

        ctx.beginPath();
        ctx.arc(node.x, y - lift * 2, 1.2 + lift * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${lift > 0.02 ? NEAR : BASE},${BASE_ALPHA + lift * 0.6})`;
        ctx.fill();
      }

      if (!reduced && visible) frame = requestAnimationFrame(paint);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
    };

    const onResize = () => {
      build();
      if (reduced) paint(0);
    };

    build();
    window.addEventListener("resize", onResize);

    if (reduced) {
      paint(0);
      return () => window.removeEventListener("resize", onResize);
    }

    // Stop the loop entirely once the canvas scrolls out of view.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) frame = requestAnimationFrame(paint);
    });
    observer.observe(canvas);

    window.addEventListener("pointermove", onPointer, { passive: true });
    frame = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
