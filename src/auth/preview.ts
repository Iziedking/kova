/**
 * Development-only preview viewer gate.
 *
 * Both flags are explicit opt-ins that no deployment sets: fixtures must be on,
 * and so must the preview flag. Shared by the proxy, server pages and
 * `services/index.ts`, which is why it reads a plain env record.
 */
type EnvLike = Partial<Record<string, string | undefined>>;

export function previewViewerEnabled(env: EnvLike = process.env): boolean {
  return env.NEXT_PUBLIC_KOVA_DATA_SOURCE === "fixtures" && env.NEXT_PUBLIC_KOVA_PREVIEW_VIEWER === "1";
}

/**
 * Development/test-only auth stub: a deterministic stand-in for Privy so the
 * Kova sign-in UI (X, email + code, first-run identity, redirect) can be driven
 * end to end without a network. Same guard as the preview viewer: fixtures must
 * be on AND the flag set explicitly, so no real deployment can enable it.
 */
export function authStubEnabled(env: EnvLike = process.env): boolean {
  return env.NEXT_PUBLIC_KOVA_DATA_SOURCE === "fixtures" && env.NEXT_PUBLIC_KOVA_AUTH_STUB === "1";
}

/**
 * Whether server-side session checks stand down because a fixtures-only viewer
 * (preview viewer or auth stub) is standing in for Privy. Never true unless
 * fixtures are explicitly enabled.
 */
export function sessionCheckBypassed(env: EnvLike = process.env): boolean {
  return previewViewerEnabled(env) || authStubEnabled(env);
}
