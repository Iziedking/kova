import { ImageResponse } from "next/og";
import { NearCard } from "./near-card";

/** The card X, Telegram and Discord show for near.kova.surf pages without a card of their own. */
export const alt = "Kova on NEAR: CHIP, the poker chip that burns. Pick the NEAR coin that rises most and beat the House.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <NearCard
      kicker="KOVA · ON NEAR"
      title="Poker with a chip that burns."
      lines={["Pick the NEAR coin you think rises most. Beat the House or a friend.", "Every pot burns 10% of itself."]}
      footer="near.kova.surf"
    />,
    size,
  );
}
