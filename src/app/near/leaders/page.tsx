import { LeadersScreen } from "@/features/near/grid/leaders-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/leaders", title: "Leaderboard · Kova on NEAR", description: "Who has won the most in each mine, from the results the contracts still hold.", card: false });

export default function NearLeadersPage() {
  return <LeadersScreen />;
}
