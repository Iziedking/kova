import { notFound } from "next/navigation";

/**
 * Any /near path without a page of its own. src/proxy.ts sends every NEAR-host path here that the
 * NEAR app does not have (for example /markets), so it gets the NEAR 404 (../not-found.tsx).
 */
export default function NearUnknownPage(): never {
  notFound();
}
