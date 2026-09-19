/** VM bearer verification using @privy-io/server-auth 1.32.5, inspected 2026-09-19. */
import { PrivyClient } from "@privy-io/server-auth";

export interface AuthPrincipal {
  privyUserId: string;
}

export interface GameAuthVerifier {
  verifyBearer(token: string): Promise<AuthPrincipal | null>;
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
}

export function bearerFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match?.[1] ?? null;
}

