import { notFound } from "next/navigation";

/**
 * The original poker-style pages (play, tables, clans, launches, the old token and account pages and the
 * old landing) are hidden. They are kept in the repo and come back only when KOVA_NEAR_CLASSIC=true, so the
 * new Kova is the only product anyone sees. Call this first in each of those pages.
 */
export function requireClassic(): void {
  if (process.env.KOVA_NEAR_CLASSIC !== "true") notFound();
}
