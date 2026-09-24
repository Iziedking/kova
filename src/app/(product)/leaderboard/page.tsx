import type { Metadata } from "next";
import { LeaderboardScreen } from "@/features/social/leaderboard-screen";

export const metadata: Metadata = {
  title: "Leaderboard · Kova",
  description: "The best records on Kova across Predict and Trade.",
};

export default function LeaderboardPage() {
  return <LeaderboardScreen />;
}
