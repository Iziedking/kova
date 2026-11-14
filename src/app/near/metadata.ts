import type { Metadata } from "next";

/** Every NEAR page's share text names NEAR only; nothing here mentions kova.surf's Solana product. */
export const NEAR_SITE_NAME = "Kova on NEAR";
export const NEAR_ORIGIN = "https://near.kova.surf";
export const NEAR_TITLE = "Kova on NEAR: a mining game for memecoins";
export const NEAR_DESCRIPTION = "Stake your memecoin. One square wins every minute. Losers pay winners and 10% is burned. NEAR testnet, coins worth nothing.";
export const NEAR_CARD_ALT = "Kova on NEAR. Stake your memecoin on a 5 by 5 grid. One square wins every minute. NEAR testnet, coins worth nothing.";

/** The NEAR share card (src/app/near/opengraph-image.tsx), 1200 by 630. */
const NEAR_CARD = { url: "/near/opengraph-image", width: 1200, height: 630, alt: NEAR_CARD_ALT, type: "image/png" };

/**
 * One page's metadata: its canonical and og:url are its own near.kova.surf address. A page with
 * its own card (a table link) passes card: false so its own opengraph-image is used.
 */
export function nearPageMetadata({ path, title, description, card = true }: { path: string; title: string; description: string; card?: boolean }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: NEAR_SITE_NAME, url: path, title, description, ...(card ? { images: [NEAR_CARD] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(card ? { images: [{ url: NEAR_CARD.url, alt: NEAR_CARD_ALT }] } : {}) },
  };
}
