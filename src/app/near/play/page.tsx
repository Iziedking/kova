import type { Metadata } from "next";
import { PlayScreen } from "@/features/near/play-screen";

export const metadata: Metadata = {
  title: "Play the House · Kova on NEAR",
  description: "Stake CHIP against the House in a 60-second round. Every pot burns 10% of itself. NEAR testnet; CHIP has no value.",
};

export default function NearPlayPage() {
  return <PlayScreen />;
}
