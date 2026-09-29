"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a class that briefly tints a live number green or red when it changes, so a
 * refresh reads as movement rather than a silent swap. Empty on first render and when unchanged.
 */
export function useFlash(value: number | null | undefined): string {
  const previous = useRef(value);
  const [flash, setFlash] = useState<{ className: string; key: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before == null || value == null || before === value) return;
    setFlash({ className: value > before ? "kova-flash-up" : "kova-flash-down", key: Date.now() });
    const timer = setTimeout(() => setFlash(null), 1_150);
    return () => clearTimeout(timer);
  }, [value]);

  return flash?.className ?? "";
}
