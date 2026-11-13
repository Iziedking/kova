/**
 * Routing for the NEAR host (near.kova.surf). Every page there is served from /near, so a visitor
 * on the NEAR host never reaches a kova.surf (Solana) page: a path the NEAR app does not have
 * lands on the NEAR 404 instead. Pure, so it is unit-tested; src/proxy.ts applies it.
 */

/** near.kova.surf, near.localhost:3000 and so on. */
export function isNearHost(host: string | null | undefined): boolean {
  return /^near\./i.test(host ?? "");
}

/** Paths the NEAR host serves as they are. */
function passesThrough(pathname: string): boolean {
  if (pathname === "/near" || pathname.startsWith("/near/")) return true;
  if (pathname.startsWith("/api/near/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  // Static files and icons (/icon.jpg, /near/chip-supply.svg, /favicon.ico).
  return /\/[^/]+\.[a-z0-9]{2,5}$/i.test(pathname);
}

/**
 * The /near path a NEAR-host request is served from, or null to serve it unchanged.
 * "/" -> "/near", "/play" -> "/near/play", "/t/7" -> "/near/t/7", and "/markets" -> "/near/markets",
 * which the NEAR app does not have, so it shows the NEAR 404.
 */
export function nearHostRewrite(pathname: string): string | null {
  if (passesThrough(pathname)) return null;
  const path = pathname.replace(/\/+$/, "");
  return path === "" ? "/near" : `/near${path}`;
}
