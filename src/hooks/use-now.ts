"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared one-second clock for every countdown on the page.
 *
 * Returns `null` on the server and during hydration so countdown text never
 * mismatches, then ticks. Countdowns should still be derived from a server
 * timestamp where the backend supplies one (see `useCountdown`).
 */
let current: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function readClock(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    current = readClock();
    timer = setInterval(() => {
      current = readClock();
      listeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (current === null) current = readClock();
  return current;
}

function getServerSnapshot(): null {
  return null;
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Seconds until `endsAtIso`, or null until the clock is running.
 * `serverTimeIso` corrects for a wrong client clock: the offset between the
 * server's time at read and the client's time at read is applied.
 */
export function useCountdown(endsAtIso: string | null | undefined, serverTimeIso?: string | null, readAt?: number): number | null {
  const now = useNow();
  if (now === null || !endsAtIso) return null;
  const end = Date.parse(endsAtIso);
  if (!Number.isFinite(end)) return null;
  const skew = serverTimeIso && readAt ? Date.parse(serverTimeIso) - readAt : 0;
  return Math.max(0, Math.floor((end - (now + (Number.isFinite(skew) ? skew : 0))) / 1000));
}
