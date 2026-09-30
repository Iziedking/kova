import type { Metadata } from "next";
import { HouseScreen } from "@/features/house/house-screen";

export const metadata: Metadata = {
  title: "The House · Kova",
  description: "Kova's AI trading agent: its live record, risk rules and every decision, with stakes in on-chain escrow.",
};

export default function HousePage() {
  return <HouseScreen />;
}
