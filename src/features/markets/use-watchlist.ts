"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useViewer } from "@/features/auth/viewer";

/**
 * A per-person watchlist of mints.
 *
 * INTEGRATION SEAM: there is no watchlist endpoint yet, so this is kept on this
 * device only (keyed by the Privy user id) and the UI says so. Swap the
 * read/write here for a `MarketService` call once the backend exposes one.
 */
const listeners = new Set<() => void>();
const snapshots = new Map<string, string[]>();
const EMPTY: string[] = [];

function read(userId: string): string[] {
  const cached = snapshots.get(userId);
  if (cached) return cached;
  let parsed: string[] = EMPTY;
  try {
    const raw = window.localStorage.getItem(`kova.watchlist.v1:${userId}`);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(value)) parsed = value.filter((item): item is string => typeof item === "string");
  } catch {
    // Storage blocked: an empty list that lives in memory for this session.
  }
  snapshots.set(userId, parsed);
  return parsed;
}

function write(userId: string, mints: string[]) {
  snapshots.set(userId, mints);
  try {
    window.localStorage.setItem(`kova.watchlist.v1:${userId}`, JSON.stringify(mints));
  } catch {
    // Keep the in-memory copy.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWatchlist(): { watching: (mint: string) => boolean; toggle: (mint: string) => boolean } {
  const viewer = useViewer();
  const userId = viewer.userId;
  const list = useSyncExternalStore(
    subscribe,
    () => (userId ? read(userId) : EMPTY),
    () => EMPTY,
  );

  const watching = useCallback((mint: string) => list.includes(mint), [list]);
  const toggle = useCallback(
    (mint: string): boolean => {
      if (!userId) return false;
      const current = read(userId);
      const next = current.includes(mint) ? current.filter((item) => item !== mint) : [...current, mint];
      write(userId, next);
      return next.includes(mint);
    },
    [userId],
  );

  return { watching, toggle };
}
