"use client";

import { useEffect, useEffectEvent, useState } from "react";

export type Polled<T> = {
  data: T | null;
  error: string | null;
  /** True when the last read failed but an earlier value is still shown. */
  stale: boolean;
  updatedAt: number | null;
  refresh: () => void;
};

type Slot<T> = { key: string; data: T | null; error: string | null; updatedAt: number | null };

/**
 * Reads `load` now and every `intervalMs` while the tab is visible. Keeps the last good value
 * when a read fails. A new `key` starts from empty, so values never leak between subjects.
 */
export function usePoll<T>(load: (() => Promise<T>) | null, intervalMs: number, key: string): Polled<T> {
  const [slot, setSlot] = useState<Slot<T>>({ key, data: null, error: null, updatedAt: null });
  const [nonce, setNonce] = useState(0);
  const enabled = load !== null;

  const read = useEffectEvent(async () => {
    if (!load) return;
    const readKey = key;
    try {
      const value = await load();
      setSlot({ key: readKey, data: value, error: null, updatedAt: Date.now() });
    } catch (e) {
      const message = (e as Error).message || "Read failed";
      setSlot((s) => (s.key === readKey ? { ...s, error: message } : { key: readKey, data: null, error: message, updatedAt: null }));
    }
  });

  useEffect(() => {
    if (!enabled) return;
    // The first read is scheduled, not run inline, so state only changes from a callback.
    const first = window.setTimeout(() => void read(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [key, intervalMs, nonce, enabled]);

  const current = slot.key === key ? slot : { data: null, error: null, updatedAt: null };
  return { data: current.data, error: current.error, stale: current.error !== null && current.data !== null, updatedAt: current.updatedAt, refresh: () => setNonce((n) => n + 1) };
}
