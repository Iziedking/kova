"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "kova-local-value";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}

/** A localStorage value that re-renders on change, in this tab or another. Null on the server. */
export function useLocalValue(key: string | null): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (key ? window.localStorage.getItem(key) : null),
    () => null,
  );
  const set = useCallback(
    (next: string | null) => {
      if (!key) return;
      if (next === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, next);
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
