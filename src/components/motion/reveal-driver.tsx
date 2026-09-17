"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "./reduced-motion";

/**
 * Scroll-reveal driver.
 *
 * The hidden state lives behind `html[data-kova-motion]`, and only this component
 * sets that attribute. If the script never runs, every `[data-reveal]` block stays
 * visible instead of leaving a blank page. One IntersectionObserver handles the
 * whole document and unobserves each element once it has played; nothing polls
 * scroll position.
 */
export function RevealDriver() {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = document.documentElement;
    const showAll = () =>
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-in"));

    if (reduced) {
      root.removeAttribute("data-kova-motion");
      showAll();
      return;
    }

    root.setAttribute("data-kova-motion", "");

    if (!("IntersectionObserver" in window)) {
      showAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    const observeNew = () =>
      document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => observer.observe(el));

    // Async data can insert content after the route's initial frame.
    const mutations = new MutationObserver(observeNew);
    mutations.observe(document.body, { childList: true, subtree: true });

    // A frame's grace, so the first paint lands before anything is revealed.
    const raf = requestAnimationFrame(observeNew);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mutations.disconnect();
      root.removeAttribute("data-kova-motion");
    };
  }, [pathname, reduced]);

  return null;
}
