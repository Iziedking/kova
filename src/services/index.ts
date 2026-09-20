/**
 * Chooses the service implementation.
 *
 * `NEXT_PUBLIC_KOVA_DATA_SOURCE`:
 *   - `api`      real backend routes; anything the backend lacks is a pending state.
 *   - `fixtures` typed development fixtures (`src/features/fixtures`).
 *
 * Unset: `fixtures` under `next dev`, `api` everywhere else. A production build
 * therefore never serves fixture data unless the flag is set explicitly, and
 * whenever fixtures are active the shell shows a persistent "Sample data" banner.
 *
 * The flag is inlined at build time, so the fixture module is only bundled when
 * fixtures are on.
 */
import type { KovaServices } from "./contracts";
import { previewViewerEnabled } from "@/auth/preview";
import { apiServices } from "./api/services";

export type DataSourceMode = "api" | "fixtures";

export function dataSourceMode(): DataSourceMode {
  const flag = process.env.NEXT_PUBLIC_KOVA_DATA_SOURCE;
  if (flag === "fixtures") return "fixtures";
  if (flag === "api") return "api";
  return process.env.NODE_ENV === "development" ? "fixtures" : "api";
}

export function isFixtureMode(): boolean {
  return dataSourceMode() === "fixtures";
}

/**
 * Development-only: render the signed-in shell without a Privy app. Requires
 * fixture mode, so it can never activate against real data.
 */
export function isPreviewViewer(): boolean {
  return isFixtureMode() && previewViewerEnabled({
    NEXT_PUBLIC_KOVA_DATA_SOURCE: "fixtures",
    NEXT_PUBLIC_KOVA_PREVIEW_VIEWER: process.env.NEXT_PUBLIC_KOVA_PREVIEW_VIEWER,
  });
}

let cached: Promise<KovaServices> | null = null;

export function loadServices(): Promise<KovaServices> {
  if (!cached) {
    // The condition is spelled out with literal `process.env` reads (not via
    // `isFixtureMode()`) so the bundler can fold it at build time and drop the
    // fixture chunk entirely from a build that does not use fixtures.
    if (
      process.env.NEXT_PUBLIC_KOVA_DATA_SOURCE === "fixtures" ||
      (process.env.NEXT_PUBLIC_KOVA_DATA_SOURCE !== "api" && process.env.NODE_ENV === "development")
    ) {
      cached = import("@/features/fixtures/services").then((module) => module.fixtureServices);
    } else {
      cached = Promise.resolve(apiServices);
    }
  }
  return cached;
}
