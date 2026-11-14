import { redirect } from "next/navigation";
import { LeaderboardScreen } from "@/features/near/leaderboard-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({
  path: "/leaderboard",
  title: "Leaderboard · Kova on NEAR",
  description: "Players ranked by net CHIP and launch scouts ranked by calls, built from the contract's settled tables. NEAR testnet; CHIP has no value.",
});

/** The old poker leaderboard is hidden; /near/leaders (global, all coins) replaces it. KOVA_NEAR_CLASSIC=true brings the old one back. */
export default function Page() {
  if (process.env.KOVA_NEAR_CLASSIC !== "true") redirect("/near/leaders");
  return <LeaderboardScreen />;
}
