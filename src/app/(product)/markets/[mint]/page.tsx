import type { Metadata } from "next";
import { MarketDetailScreen } from "@/features/markets/market-detail-screen";

export const metadata: Metadata = {
  title: "Market · Kova",
  description: "Price, activity and how to play this meme stock on Kova.",
};

export default async function MarketPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return <MarketDetailScreen mint={decodeURIComponent(mint)} />;
}
