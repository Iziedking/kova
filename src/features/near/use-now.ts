"use client";

import { useSyncExternalStore } from "react";

/** Unix seconds, updated once a second. One shared timer for every countdown on the page. */
const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) timer = window.setInterval(() => listeners.forEach((l) => l()), 1_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => Math.floor(Date.now() / 1000);

export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
