import { LeadersScreen } from "@/features/near/grid/leaders-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/leaders", title: "Leaderboard · Kova on NEAR", description: "Who wins, earns and burns across all coins.", card: false });

export default function NearLeadersPage() {
  return <LeadersScreen />;
}
