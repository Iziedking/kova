"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useIntent } from "@/features/auth/use-intent";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { useViewer } from "@/features/auth/viewer";
import { ChallengeSheet } from "./challenge-sheet";

/** Reopens the challenge sheet after sign-in: `?intent=challenge:<username>`. */
function ChallengeIntent({ onIntent }: { onIntent: (username: string) => void }) {
  const viewer = useViewer();
  const { intent, clear } = useIntent();
  const authed = viewer.status === "authed";
  useEffect(() => {
    if (authed && intent?.startsWith("challenge:")) {
      onIntent(intent.slice("challenge:".length));
      clear();
    }
  }, [authed, intent, onIntent, clear]);
  return null;
}

/**
 * One challenge entry point for every surface (profile, leaderboard, Hot Players,
 * recent showdowns). Guests are sent to sign in and land back on the same page
 * with `?intent=challenge:<username>`, which reopens the sheet.
 *
 * Usage: `const { challenge, sheet } = useChallenge(); ... {sheet}`
 * Render `sheet` once per page.
 */
export function useChallenge(): { challenge: (username: string) => void; sheet: ReactNode } {
  const requireAuth = useRequireAuth();
  const [target, setTarget] = useState<string | null>(null);

  const challenge = useCallback(
    (username: string) => {
      requireAuth(() => setTarget(username), { intent: `challenge:${username}` });
    },
    [requireAuth],
  );

  const sheet = (
    <>
      <Suspense fallback={null}>
        <ChallengeIntent onIntent={setTarget} />
      </Suspense>
      {target ? (
        <ChallengeSheet
          key={target}
          open
          opponent={target}
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
        />
      ) : null}
    </>
  );

  return { challenge, sheet };
}
