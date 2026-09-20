"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { loginHref } from "@/auth/redirect";
import { useViewer } from "./viewer";

/**
 * Intent-triggered auth (blueprint 44.2): guests browse freely, and the login
 * gate appears only when they attempt an account action. The current path is
 * carried through `next`, so the person lands back on the action they wanted.
 *
 * `intent` is appended as `?intent=` so the destination page can reopen the
 * exact sheet (create table, challenge, ...) once the person is signed in.
 */
export function useRequireAuth() {
  const viewer = useViewer();
  const router = useRouter();

  return useCallback(
    (run: () => void, options: { intent?: string; next?: string } = {}): boolean => {
      if (viewer.status === "authed") {
        run();
        return true;
      }
      // `loading` is treated like a guest: if Privy is slow or unreachable the click must
      // still do something. A signed-in person who lands on /login is returned to `next`
      // immediately by the login screen, so the worst case is a brief hop, never a dead button.
      let next = options.next;
      if (!next) {
        const url = new URL(window.location.href);
        if (options.intent) url.searchParams.set("intent", options.intent);
        next = `${url.pathname}${url.search}`;
      }
      router.push(loginHref(next, "required"));
      return false;
    },
    [viewer.status, router],
  );
}

/** Same gate, for a value the caller reads during render (e.g. to change a button label). */
export function useIsAuthed(): boolean {
  return useViewer().status === "authed";
}
