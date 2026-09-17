/**
 * Privy configuration readers.
 *
 * `NEXT_PUBLIC_PRIVY_APP_ID` is public by design and is the only Privy value
 * permitted in the browser bundle. The secret is never read here; it is read
 * only inside `session.ts`, which is marked server-only, so no import path can
 * drag it into a client component.
 */
type EnvLike = Partial<Record<string, string | undefined>>;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readPrivyAppId(env: EnvLike): string | null {
  return clean(env.NEXT_PUBLIC_PRIVY_APP_ID);
}

export function isPrivyConfigured(env: EnvLike): boolean {
  return clean(env.NEXT_PUBLIC_PRIVY_APP_ID) !== null && clean(env.PRIVY_APP_SECRET) !== null;
}

/** Safe in a client component: resolves to the public app id or null. */
export function privyAppId(): string | null {
  return readPrivyAppId({ NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID });
}
