import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { PrivyClient } from "@privy-io/server-auth";
import { isPrivyConfigured } from "./privy-env";

export interface KovaSession {
  userId: string;
  sessionId: string;
}

/** Privy's access-token cookie, confirmed against the installed package. */
const ACCESS_TOKEN_COOKIE = "privy-token";

let client: PrivyClient | null = null;

function privyClient(): PrivyClient | null {
  if (!isPrivyConfigured(process.env)) return null;
  if (!client) {
    client = new PrivyClient(
      String(process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID),
      String(process.env.PRIVY_APP_SECRET),
    );
  }
  return client;
}

/**
 * The authorization boundary. `cache` keeps this to one verification per request.
 *
 * Returns null for every failure mode, including a missing cookie, an expired or
 * tampered token, absent configuration and a Privy outage. A page that cannot
 * prove a session must render the signed-out surface, never a trusted one.
 *
 * `src/proxy.ts` is only an optimistic check and can be fooled by a forged
 * cookie; this is what actually rejects it.
 */
export const getSession = cache(async (): Promise<KovaSession | null> => {
  const instance = privyClient();
  if (!instance) return null;

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  try {
    const claims = await instance.verifyAuthToken(token);
    return { userId: claims.userId, sessionId: claims.sessionId };
  } catch {
    return null;
  }
});
