/**
 * The single source of truth for which paths need a session, shared by
 * `src/proxy.ts` and its tests.
 *
 * KOVA_FRONTEND_IMPLEMENTATION_V2 section 44.13: browsing is public so a
 * first-time visitor can understand the product and see live activity before
 * being asked for an identity. The gate is intent-triggered:
 *
 * - Route-level (here): surfaces that are entirely personal - the portfolio,
 *   settings and notifications.
 * - Action-level (`AuthGuard` / `useRequireAuth`): create or join a table,
 *   challenge, watch, follow. `/app`, `/play` and `/tables/*` render for guests
 *   as a lobby and spectator surface, and gate the action, not the page.
 * - Wallet-level (`useRequireWallet`): ANSEM stake, real trades, money movement.
 *
 * To make `/app` or `/play` fully private, add the prefix below; nothing else
 * has to change.
 */
export const PROTECTED_PREFIXES = ["/portfolio", "/settings", "/notifications"] as const;

export function isProtectedPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  for (const prefix of PROTECTED_PREFIXES) {
    // Match on a segment boundary, so `/portfolios` is not caught by `/portfolio`.
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }

  return false;
}
