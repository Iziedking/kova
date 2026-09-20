import type { NextConfig } from "next";
import path from "node:path";

/** Modules replaced by inert stand-ins whenever fixtures are not enabled. */
const FIXTURE_STANDINS = {
  "@/features/fixtures/services": "src/features/fixtures/disabled.ts",
  "@/features/fixtures/preview-viewer": "src/features/fixtures/disabled-viewer.tsx",
  "@/features/fixtures/stub-viewer": "src/features/fixtures/disabled-viewer.tsx",
} as const;

/** Fixtures are on for `next dev` by default, or whenever explicitly requested. */
const fixturesEnabled =
  process.env.NEXT_PUBLIC_KOVA_DATA_SOURCE === "fixtures" ||
  (process.env.NEXT_PUBLIC_KOVA_DATA_SOURCE !== "api" && process.env.NODE_ENV === "development");

const config: NextConfig = {
  // Pin the workspace root to this project. The parent directory also holds a
  // lockfile, and without this Next warns and may resolve against it. This
  // replaces an earlier override that pointed at the parent, which is stale now
  // that KOVA has its own package.json, lockfile and node_modules.
  turbopack: {
    root: import.meta.dirname,
    // A build that does not use fixtures must not contain them. The fixture
    // modules (data, preview viewer, auth stub) are swapped for inert stand-ins, so
    // no fixture data or stub credentials are emitted.
    resolveAlias: fixturesEnabled
      ? {}
      : Object.fromEntries(Object.entries(FIXTURE_STANDINS).map(([from, to]) => [from, `./${to}`])),
  },

  // Same swap for `next build --webpack` (the build CONTRIBUTING.md asks for). Next's
  // compiler rewrites `@/` imports to relative paths before webpack sees them, so a
  // resolve alias cannot match; the module is replaced by request pattern instead.
  webpack(config, { webpack }) {
    if (!fixturesEnabled) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/(^|[\\/])fixtures[\\/](services|preview-viewer|stub-viewer)$/, (resource: { request: string }) => {
          const name = resource.request.match(/(services|preview-viewer|stub-viewer)$/)?.[1];
          const standIn = name === "services" ? FIXTURE_STANDINS["@/features/fixtures/services"] : FIXTURE_STANDINS["@/features/fixtures/preview-viewer"];
          resource.request = path.join(import.meta.dirname, standIn);
        }),
      );
    }
    return config;
  },

  // The browser talks to the game API same-origin (`/api/game/*`) and Next
  // forwards it to the backend. `KOVA_BACKEND_API_URL` stays server-only, so the
  // backend origin never ships to the client and no CORS surface is added. When
  // it is unset the route 404s and the frontend reports the service as
  // unreachable rather than pretending.
  async rewrites() {
    const backend = process.env.KOVA_BACKEND_API_URL?.trim().replace(/\/+$/, "");
    if (!backend) return [];
    return [{ source: "/api/game/:path*", destination: `${backend}/api/game/:path*` }];
  },
};
export default config;
