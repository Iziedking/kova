"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { ChallengeSheet } from "./challenge-sheet";

/**
 * One challenge entry point for every surface (profile, leaderboard, Hot Players,
 * recent showdowns). Guests are sent to sign in and land back on the same page
 * with `?intent=challenge:<username>`, which reopens the sheet.
 *
 * Usage: `const { challenge, sheet } = useChallenge(); ... {sheet}`
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

  const sheet = target ? (
    <ChallengeSheet
      key={target}
      open
      opponent={target}
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
    />
  ) : null;

  return { challenge, sheet };
}
