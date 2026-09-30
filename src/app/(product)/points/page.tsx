import type { Metadata } from "next";
import { PointsScreen } from "@/features/points/points-screen";

export const metadata: Metadata = {
  title: "Points · Kova",
  description: "Season points for playing staked games and inviting friends on Kova.",
};

export default function PointsPage() {
  return <PointsScreen />;
}
