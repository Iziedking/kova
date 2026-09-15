import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // Local scaffold fallback: dependencies currently live in the parent workspace.
  // Remove this override once FLOAT installs its own lockfile dependencies.
  turbopack: { root: path.resolve(process.cwd(), "..") },
};
export default config;
