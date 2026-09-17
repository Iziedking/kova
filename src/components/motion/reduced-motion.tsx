"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Defaults to true, so the server renders the still version and nothing animates
 * before hydration has confirmed the viewer's preference. Erring toward stillness
 * is the safe direction: a missed animation is a non-event, a missed guard is not.
 */
const ReducedMotionContext = createContext(true);

export function useReducedMotion(): boolean {
  return useContext(ReducedMotionContext);
}

export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return <ReducedMotionContext.Provider value={reduced}>{children}</ReducedMotionContext.Provider>;
}
