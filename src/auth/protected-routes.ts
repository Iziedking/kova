/**
 * The single source of truth for which paths need a session, shared by
 * `src/proxy.ts` and its tests.
 *
 * Spec section 3.3: `/app` and market reading stay open while signed out, so a
 * first-time visitor reaches a dossier and its evidence with no account, wallet,
 * payment or permission setup. Only surfaces that commit capital or expose
 * account state are protected.
 */
export const PROTECTED_PREFIXES = [
  "/app/positions",
  "/app/autopilot",
  "/app/workspace",
  "/app/campaigns/new",
] as const;

/** The path segment inside a market dossier that starts the backing wizard. */
const BACKING_SEGMENT = "/back";

export function isProtectedPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  for (const prefix of PROTECTED_PREFIXES) {
    // Match on a segment boundary, so `/app/workspaces` is not caught by `/app/workspace`.
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }

  // `/app/markets/<id>/back` and anything beneath it is the backing wizard.
  if (path.startsWith("/app/markets/")) {
    if (path.endsWith(BACKING_SEGMENT) || path.includes(`${BACKING_SEGMENT}/`)) return true;
  }

  return false;
}
