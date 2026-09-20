import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketsScreen } from "@/features/markets/markets-screen";
import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Markets · Kova",
  description: "Meme stocks people are playing right now. Search, compare and jump into a table.",
};

export default function MarketsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer as="main" className="space-y-6">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-96 w-full" />
        </PageContainer>
      }
    >
      <MarketsScreen />
    </Suspense>
  );
}
