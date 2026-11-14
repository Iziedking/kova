import { GridLanding } from "@/features/near/grid/grid-landing";
import { nearPageMetadata } from "./metadata";

export const metadata = nearPageMetadata({
  path: "/",
  title: "Kova on NEAR: a mining game for memecoins",
  description: "Stake your memecoin. One square wins every minute. Losers pay winners and 10% is burned. NEAR testnet, coins worth nothing.",
  card: false,
});

export default function NearHomePage() {
  return <GridLanding />;
}
