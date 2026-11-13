import { ImageResponse } from "next/og";
import { NEAR_CARD_ALT } from "./metadata";
import { NearCard } from "./near-card";

/** The card X, Telegram and Discord show for near.kova.surf pages without a card of their own. */
export const alt = NEAR_CARD_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <NearCard
      kicker="KOVA · ON NEAR"
      title="Play the launches while they cook."
      lines={["The arena beside the launchpad: call meme.cooking auctions or pick NEAR coins.", "Stake CHIP. Every pot burns 10% of itself."]}
      footer="near.kova.surf"
    />,
    size,
  );
}
