import type { Metadata } from "next";
import { AgentsScreen } from "@/features/agents/agents-screen";

export const metadata: Metadata = {
  title: "Your agents · Kova",
  description: "Let an AI agent play Kova for you, under server-enforced risk limits.",
};

export default function AgentsPage() {
  return <AgentsScreen />;
}
