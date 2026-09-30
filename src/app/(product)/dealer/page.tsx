import type { Metadata } from "next";
import { DealerScreen } from "@/features/dealer/dealer-screen";

export const metadata: Metadata = {
  title: "The Dealer · Kova",
  description: "The ClawPump agent that admits or refuses every pick on Kova, and its public record.",
};

export default function DealerPage() {
  return <DealerScreen />;
}
