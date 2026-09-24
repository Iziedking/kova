import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";

export const metadata: Metadata = {
  title: "Kova: Poker for Meme Stocks",
  description: "Predict the move or trade it live. Put your market skill against another player, using ANSEM as the stake chip.",
};

/**
 * The marketing surface. It mounts no auth provider and needs no wallet; the two
 * live sections (tables, meme stocks) carry their own loading, empty and error
 * states, so the page is usable when the API is down.
 */
export default function Page() {
  return <LandingPage />;
}
