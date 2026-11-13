import type { Metadata } from "next";

/** Every NEAR page's share text names NEAR only; nothing here mentions kova.surf's Solana product. */
export const NEAR_SITE_NAME = "Kova on NEAR";
export const NEAR_ORIGIN = "https://near.kova.surf";
export const NEAR_TITLE = "Kova on NEAR: the arena beside the launchpad";
export const NEAR_DESCRIPTION = "Play the launches while they cook. Call meme.cooking auctions or pick NEAR coins, stake CHIP, and every pot burns part of its supply. NEAR testnet; CHIP has no value.";
export const NEAR_CARD_ALT = "Kova on NEAR, the arena beside the launchpad: call whether a meme.cooking auction cooks, or pick the NEAR coin that rises most. Every pot burns 10%.";

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
