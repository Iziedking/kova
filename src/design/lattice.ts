/**
 * Pure geometry for the landing liquidity lattice. No canvas or DOM access, so
 * every value the background paints is unit-testable. Spec section 6.1.
 */

export interface LatticeNode {
  x: number;
  y: number;
  /** Per-node bob offset, so the field does not pulse in unison. */
  phase: number;
}

/** Node spacing in CSS pixels. */
export const LATTICE_GAP = 34;

/** Pointer influence radius in CSS pixels. */
export const LATTICE_REACH = 150;

/** One brand-cyan sweep every 14 seconds. */
export const SWEEP_PERIOD_MS = 14000;

const TAU = Math.PI * 2;

/**
 * A shallow decaying curve: deep exit capacity at the left, thinning rightward.
 * Bounded by `amplitude`, because both `exp(-2.2t)` and `cos(...)` are at most 1
 * over the clamped domain.
 */
export function depthCurve(x: number, width: number, amplitude: number): number {
  if (width <= 0) return 0;
  const t = Math.min(Math.max(x / width, 0), 1);
  return amplitude * Math.exp(-2.2 * t) * Math.cos(t * Math.PI * 1.15);
}

export function buildLattice(
  width: number,
  height: number,
  gap: number,
  random: () => number = Math.random,
): LatticeNode[] {
  if (width <= 0 || height <= 0 || gap <= 0) return [];
  const nodes: LatticeNode[] = [];
  for (let y = gap / 2; y < height; y += gap) {
    for (let x = gap / 2; x < width; x += gap) {
      nodes.push({ x, y, phase: random() * TAU });
    }
  }
  return nodes;
}

/** 1 at the pointer, falling linearly to 0 at `reach`. */
export function proximityBoost(dx: number, dy: number, reach: number): number {
  if (reach <= 0) return 0;
  const distance = Math.hypot(dx, dy);
  return distance >= reach ? 0 : 1 - distance / reach;
}

/** Horizontal position of the sweep line at `elapsedMs`. */
export function sweepX(elapsedMs: number, width: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  return ((elapsedMs % periodMs) / periodMs) * width;
}
