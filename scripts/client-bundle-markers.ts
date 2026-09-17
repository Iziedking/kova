/**
 * Secret markers scanned for in the built browser bundle.
 *
 * Shared by `scripts/check-client-bundle.ts` and `tests/client-bundle-markers.test.ts`
 * so the detector itself is testable.
 *
 * A plain string marker is an exact substring match. A pattern marker exists
 * because some third-party bundles legitimately contain the *format* of a
 * secret without containing one: the JOSE library Privy bundles for JWT
 * verification embeds the literal "-----BEGIN PRIVATE KEY-----" as PKCS#8
 * input validation. Matching the header alone therefore produced a false
 * positive. The pattern requires real base64 payload after the header, so
 * actual key material is still caught.
 */
export interface Marker {
  name: string;
  test: (contents: string) => boolean;
}

function literal(name: string): Marker {
  return { name, test: (contents) => contents.includes(name) };
}

/** A PEM header followed by enough base64 to be actual key material. */
export const PRIVATE_KEY_PATTERN = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\\rn"']*[A-Za-z0-9+/]{40,}/;

export const MARKERS: readonly Marker[] = [
  literal("KOVA_DATABASE_URL"),
  literal("KOVA_POSTGRES_PASSWORD"),
  literal("KOVA_SOLANA_RPC_URL"),
  literal("PRIVY_APP_SECRET"),
  literal("postgresql://"),
  {
    name: "PEM private key material",
    test: (contents) => PRIVATE_KEY_PATTERN.test(contents),
  },
];

export function findViolations(contents: string): readonly string[] {
  return MARKERS.filter((marker) => marker.test(contents)).map((marker) => marker.name);
}
