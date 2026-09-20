/**
 * The whole navigation model (blueprint section 2). Portfolio, Activity and
 * Settings are deliberately not top-level: they live behind the wallet/profile.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that mark this item active. */
  match: readonly string[];
}

export const DESKTOP_NAV: readonly NavItem[] = [
  { href: "/app", label: "Home", match: ["/app"] },
  { href: "/play", label: "Play", match: ["/play", "/tables"] },
  { href: "/markets", label: "Markets", match: ["/markets"] },
  { href: "/leaderboard", label: "Leaderboard", match: ["/leaderboard"] },
];

export function isActive(pathname: string, item: Pick<NavItem, "match">): boolean {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
