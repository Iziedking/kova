import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayScreen } from "@/features/competitions/play-screen";
import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompetitionMode } from "@/types/competition";

export const metadata: Metadata = {
  title: "Play · Kova",
  description: "Predict the move or trade it live. Find an open table, create one, or challenge a player.",
};

function parseMode(value: string | string[] | undefined): CompetitionMode {
  return value === "trade" || value === "trading" ? "trading" : "prediction";
}

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; market?: string }> }) {
  const { mode, market } = await searchParams;
  return (
    <Suspense
      fallback={
        <PageContainer as="main" className="space-y-6">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-64 w-full" />
        </PageContainer>
      }
    >
      <PlayScreen initialMode={parseMode(mode)} marketMint={typeof market === "string" && market ? market : null} />
    </Suspense>
  );
}
