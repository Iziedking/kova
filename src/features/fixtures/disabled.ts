import type { KovaServices } from "@/services/contracts";

/**
 * Build-time stand-in for `services.ts` when fixtures are not enabled: Next
 * aliases the fixture module to this file (see `next.config.ts`), so a build that
 * serves real data ships no fixture data at all - not even as an unused chunk.
 */
export const fixtureServices: KovaServices = new Proxy({} as KovaServices, {
  get() {
    throw new Error("Fixture services are disabled in this build. Set NEXT_PUBLIC_KOVA_DATA_SOURCE=fixtures to enable them.");
  },
});
