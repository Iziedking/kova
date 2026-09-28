import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * FLOAT, the liquidity prototype this repository started as, is kept for reference only.
 * It is not part of Kova, so every /legacy page is a 404 unless KOVA_SHOW_LEGACY=true.
 */
export default function LegacyLayout({ children }: { children: ReactNode }) {
  if (process.env.KOVA_SHOW_LEGACY !== "true") notFound();
  return children;
}
