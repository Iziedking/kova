import { useLayoutEffect, useRef } from "react";

/**
 * A ref that always holds the latest render's value. For callbacks that run later
 * (after a wallet connects, say) and must not act on the values from when they were created.
 * Layout effects run before any passive effect, so a resumed action reads the fresh value.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
