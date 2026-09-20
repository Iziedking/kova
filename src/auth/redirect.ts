/**
 * Post-login destination handling.
 *
 * Only same-origin absolute application paths are honoured, so `?next=` can
 * never become an open redirect. Kept free of React and `server-only` so the
 * proxy, the login page and the tests share one implementation.
 */
export const DEFAULT_AFTER_LOGIN = "/app";

/** Paths that must never be a login destination (would loop or leak). */
const REFUSED_PATHS = ["/login", "/api"] as const;

const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001f\\u007f]");

export function safeNext(raw: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  // Must be an absolute path, not protocol-relative (`//host`) or backslash-smuggled (`/\host`).
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (CONTROL_CHARACTERS.test(raw)) return fallback;
  let path: string;
  try {
    path = new URL(raw, "https://kova.invalid").pathname;
  } catch {
    return fallback;
  }
  if (REFUSED_PATHS.some((refused) => path === refused || path.startsWith(`${refused}/`))) return fallback;
  return raw;
}

export type LoginReason = "expired" | "required";

/** `/login?next=…`, preserving an intended action across authentication. */
export function loginHref(next: string | null | undefined, reason?: LoginReason): string {
  const params = new URLSearchParams();
  const safe = safeNext(next, "");
  if (safe) params.set("next", safe);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
