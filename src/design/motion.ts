/** Pure motion math. No DOM access, so it is unit-testable and SSR-safe. */

/** Lenis smoothing. Landing only; the app never uses smooth scroll. */
export const LENIS_LERP = 0.1;

/** Below this an easing snaps, so a loop settles instead of chasing forever. */
const EPSILON = 0.001;

export function approach(current: number, target: number, ease: number): number {
  const next = current + (target - current) * ease;
  return Math.abs(target - next) < EPSILON ? target : next;
}
