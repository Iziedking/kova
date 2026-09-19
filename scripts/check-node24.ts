/** Runs the complete gate in the exact pinned Linux Node 24 release image. */
import { execFileSync } from "node:child_process";

const mount = `type=bind,source=${process.cwd()},target=/src,readonly`;
execFileSync("docker", [
  "run",
  "--rm",
  "--mount",
  mount,
  "node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1",
  "sh",
  "/src/scripts/verify-node24-container.sh",
], { stdio: "inherit" });
