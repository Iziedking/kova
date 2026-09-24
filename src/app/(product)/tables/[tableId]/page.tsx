import type { Metadata } from "next";
import { Suspense } from "react";
import { TableScreen } from "@/features/competitions/table-screen";
import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Table · Kova",
  description: "Watch or play a Kova table.",
};

export default async function TablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return (
    <Suspense
      fallback={
        <PageContainer as="main" className="space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-72 w-full" />
        </PageContainer>
      }
    >
      <TableScreen tableId={tableId} />
    </Suspense>
  );
}
