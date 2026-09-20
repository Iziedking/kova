"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { loadServices } from "@/services";
import { LiveBadge } from "@/components/ui/badge";
import { MobileTopBar } from "@/components/shell/mobile-header";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { PredictionMatch } from "@/features/prediction/prediction-match";
import { TradingMatch } from "@/features/trading/trading-match";
import type { TableDetail } from "@/types/competition";
import { ShowdownScreen } from "./showdown-screen";
import { TableHeader } from "./table-header";
import { WaitingRoom } from "./waiting-room";

function TableSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

/** Redeems `?invite=` once the viewer is signed in, then refreshes the table. */
function useInviteClaim(onClaimed: () => void) {
  const params = useSearchParams();
  const viewer = useViewer();
  const token = params.get("invite");
  const [claimed, setClaimed] = useState<string | null>(null);
  const ready = viewer.status === "authed";

  useEffect(() => {
    if (!token || !ready || claimed === token) return;
    let cancelled = false;
    void loadServices()
      .then((s) => s.competitions.claimInvitation(token, { getAccessToken: viewer.getAccessToken }))
      .then((result) => {
        if (cancelled) return;
        setClaimed(token);
        if (result.ok) {
          toast.success("Invitation accepted");
          onClaimed();
        } else {
          toast.error(result.error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, ready, claimed, viewer.getAccessToken, onClaimed]);
}

async function shareTable(name: string) {
  const url = window.location.href.split("?")[0];
  try {
    if (navigator.share) await navigator.share({ title: name, url });
    else {
      await navigator.clipboard.writeText(url);
      toast.success("Table link copied");
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Couldn't share this table.");
  }
}

function Body({ table, readAt, refetch }: { table: TableDetail; readAt: number; refetch: () => void }) {
  switch (table.status) {
    case "open":
    case "waiting":
      return <WaitingRoom table={table} readAt={readAt} onChanged={refetch} />;
    case "active":
    case "settling":
      return table.mode === "trading" ? <TradingMatch table={table} readAt={readAt} /> : <PredictionMatch table={table} readAt={readAt} />;
    case "settled":
      return (
        <div className="space-y-6">
          <TableHeader table={table} showTimer={false} />
          <ShowdownScreen tableId={table.id} />
        </div>
      );
    case "cancelled":
      return (
        <div className="space-y-6">
          <TableHeader table={table} showTimer={false} />
          <EmptyState
            title="This table was cancelled"
            body="No match was played. Any stake that was funded is refunded through escrow."
            action={<Button href="/play" size="sm">Find another table</Button>}
          />
        </div>
      );
  }
}

/**
 * `/tables/[tableId]` - one route, every state of a table (waiting, active
 * Predict, active Trade, settling, settled, cancelled). The page is public, so a
 * guest can spectate; each account or money action gates where it is taken.
 * Polls every few seconds until the backend's event stream is wired in.
 */
export function TableScreen({ tableId }: { tableId: string }) {
  const { state, refetch } = useResource((s) => s.competitions.getTable(tableId), [tableId], { refreshMs: 4_000 });
  useInviteClaim(refetch);

  const table = state.status === "ready" ? state.data : null;
  const isTrading = table?.mode === "trading";

  return (
    <>
      <MobileTopBar
        title={table ? (isTrading ? "Trading Match" : "Prediction Match") : "Table"}
        status={table?.status === "active" ? <LiveBadge /> : undefined}
        backHref="/play"
        right={
          table ? (
            <button type="button" aria-label="Share table" onClick={() => void shareTable(table.name)} className="grid h-10 w-10 place-items-center text-text-primary">
              <Share2 size={19} aria-hidden="true" />
            </button>
          ) : undefined
        }
      />
      <PageContainer as="main" width={isTrading && table?.status === "active" ? "wide" : "app"} className={isTrading && table?.status === "active" ? "pt-4 md:pt-6" : undefined}>
        <ResourceView
          state={state}
          onRetry={refetch}
          errorTitle="This table couldn't load"
          pendingTitle="Tables aren't connected yet"
          loading={<TableSkeleton />}
        >
          {(data) => <Body table={data} readAt={state.status === "ready" ? state.updatedAt : 0} refetch={refetch} />}
        </ResourceView>
      </PageContainer>
    </>
  );
}
