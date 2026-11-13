import { LeaderboardScreen } from "@/features/near/leaderboard-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({
  path: "/leaderboard",
  title: "Leaderboard · Kova on NEAR",
  description: "Players ranked by net CHIP and launch scouts ranked by calls, built from the contract's settled tables. NEAR testnet; CHIP has no value.",
});

export default function Page() {
  return <LeaderboardScreen />;
}
