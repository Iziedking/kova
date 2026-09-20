import type { Metadata } from "next";
import { HomeHero } from "@/features/home/home-hero";
import { LiveNow } from "@/features/competitions/live-now";
import { TrendingMarkets } from "@/features/markets/trending-markets";
import { MemeStocksSection } from "@/features/markets/meme-stocks-section";
import { HotPlayers } from "@/features/social/hot-players";
import { RecentShowdowns } from "@/features/social/recent-showdowns";
import { InviteCrewCard } from "@/features/social/invite-crew-card";
import { PageContainer } from "@/components/shell/page-container";

export const metadata: Metadata = {
  title: "Home · Kova",
  description: "Find a table, predict the move or trade it live. Poker for Meme Stocks.",
};

/**
 * The lobby: find something or someone to play. Public - guests see live tables
 * and markets, and are asked to sign in only when they act.
 */
export default function HomePage() {
  return (
    <PageContainer as="main" className="md:pt-6">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-8 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-9 md:space-y-10">
          <HomeHero />
          <LiveNow />
          <TrendingMarkets />
          <MemeStocksSection />
        </div>

        <aside aria-label="Community" className="grid grid-cols-1 content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <HotPlayers />
          <RecentShowdowns />
          <div className="md:col-span-2 xl:col-span-1">
            <InviteCrewCard />
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
