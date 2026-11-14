import { GridLanding } from "@/features/near/grid/grid-landing";
import { nearPageMetadata } from "./metadata";

export const metadata = nearPageMetadata({
  path: "/",
  title: "Kova on NEAR: a mining game for memecoins",
  description: "Put your memecoin on a square. Every minute, one square wins. Coins on losing squares go to the winners and 10% is burned. NEAR testnet; the coins have no value.",
  card: false,
});

export default function NearHomePage() {
  return <GridLanding />;
}
