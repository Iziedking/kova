/** VM bearer verification using @privy-io/server-auth 1.32.5, inspected 2026-09-19. */
import { PrivyClient } from "@privy-io/server-auth";

export interface AuthPrincipal {
  privyUserId: string;
}

export interface LinkedXAccount {
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface GameAuthVerifier {
  verifyBearer(token: string): Promise<AuthPrincipal | null>;
  /**
   * The X account linked to this Privy user, read from Privy's server API, or null.
   * `undefined` when the lookup failed (keep what is stored).
   */
  linkedX?(privyUserId: string): Promise<LinkedXAccount | null | undefined>;
}

export class PrivyGameAuthVerifier implements GameAuthVerifier {
  private readonly client: PrivyClient;

  constructor(appId: string, appSecret: string) {
    this.client = new PrivyClient(appId, appSecret);
  }

  async verifyBearer(token: string): Promise<AuthPrincipal | null> {
    try {
      const claims = await this.client.verifyAuthToken(token);
      return claims.appId && claims.userId ? { privyUserId: claims.userId } : null;
    } catch {
      return null;
    }
  }

  async linkedX(privyUserId: string): Promise<LinkedXAccount | null | undefined> {
    try {
      const user = await this.client.getUser(privyUserId);
      const x = user.twitter;
      return x?.username ? { username: x.username, name: x.name ?? null, avatarUrl: x.profilePictureUrl ?? null } : null;
    } catch {
      return undefined;
    }
  }
}

export function bearerFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}

