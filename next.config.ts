import type { NextConfig } from "next";

const config: NextConfig = {
  // Pin the workspace root to this project. The parent directory also holds a
  // lockfile, and without this Next warns and may resolve against it. This
  // replaces an earlier override that pointed at the parent, which is stale now
  // that KOVA has its own package.json, lockfile and node_modules.
  turbopack: { root: import.meta.dirname },
};
export default config;
