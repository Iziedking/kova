"use client";

import { Plus, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loginHref } from "@/auth/redirect";
import { useIntent } from "@/features/auth/use-intent";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { ModeSelector } from "@/components/play/mode-selector";
import { TableCard, TableCardSkeleton } from "@/components/play/table-card";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section";
import { EmptyState, ResourceView } from "@/components/ui/states";
import type { CompetitionMode } from "@/types/competition";
import { CreateTableSheet } from "./create-table-sheet";
import { useChallenge } from "./use-challenge";

/**
 * Play: mode choice, find an open table, create one, or challenge a player
 * (blueprint 9). Public to browse; creating a table requires a session, and a
 * guest who arrives with `?intent=create` is sent to sign in and returned here.
 */
export function PlayScreen({ initialMode, marketMint = null }: { initialMode: CompetitionMode; marketMint?: string | null }) {
  const router = useRouter();
  const viewer = useViewer();
  const requireAuth = useRequireAuth();
  const { intent, clear } = useIntent();
  const { sheet: challengeSheet } = useChallenge();
  const [mode, setMode] = useState<CompetitionMode>(initialMode);
  const [createOpen, setCreateOpen] = useState(false);
  const openTables = useRef<HTMLElement>(null);

  const { state, refetch } = useResource((s) => s.competitions.listTables({ mode, status: "open", limit: 12 }), [mode], { refreshMs: 15_000 });

  const market = useResource((s) => s.markets.getByMint(marketMint as string), [marketMint], { enabled: marketMint !== null });
  const initialMarket = market.state.status === "ready" ? { mint: market.state.data.mint, symbol: market.state.data.symbol } : null;
  const wantsCreate = intent === "create" || intent === "create-private";
  // A guest arriving with a create intent signs in first and comes straight back.
  useEffect(() => {
    if (wantsCreate && viewer.status === "guest") {
      router.replace(loginHref(`${window.location.pathname}${window.location.search}`, "required"));
    }
  }, [wantsCreate, viewer.status, router]);

  // A specific-market create waits for the market lookup so the sheet opens with it filled in.
  const marketReady = marketMint === null || market.state.status !== "loading";
  const sheetOpen = marketReady && (createOpen || (wantsCreate && viewer.status === "authed"));

  return (
    <PageContainer as="main" className="space-y-9">
      <header>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Play</h1>
        <p className="mt-1 text-[16px] text-text-secondary">Pick a mode, stake ANSEM, and beat another player.</p>
      </header>

      <ModeSelector
        value={mode}
        onChange={setMode}
        onPlay={(next) => {
          setMode(next);
          openTables.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <section ref={openTables} aria-labelledby="open-tables-title" className="scroll-mt-24">
        <SectionHeader title={mode === "prediction" ? "Open Predict tables" : "Open Trade tables"} subtitle="Find an open table" />
        <span id="open-tables-title" className="sr-only">Open tables</span>
        <ResourceView
          state={state}
          onRetry={refetch}
          errorTitle="Open tables couldn't load"
          pendingTitle="Tables aren't connected yet"
          loading={
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <TableCardSkeleton key={key} />
              ))}
            </div>
          }
          isEmpty={(tables) => tables.length === 0}
          empty={
            <EmptyState
              title={`No open ${mode === "prediction" ? "Predict" : "Trade"} tables right now.`}
              body="Create one and invite someone, or challenge a player directly."
              action={
                <Button size="sm" iconLeft={<Plus size={15} />} onClick={() => requireAuth(() => setCreateOpen(true), { intent: "create" })}>
                  Create table
                </Button>
              }
            />
          }
        >
          {(tables) => (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tables.map((table) => (
                <TableCard key={table.id} table={table} />
              ))}
            </div>
          )}
        </ResourceView>
      </section>

      <section aria-label="Create or challenge" className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-panel border border-border-subtle bg-surface-1 p-5 md:p-6">
          <h2 className="font-display text-[22px] font-bold text-text-primary">Create a table</h2>
          <p className="mt-1 text-[15px] text-text-secondary">Set the stake, duration and seats. Invite friends or open it to everyone.</p>
          <Button className="mt-5 self-start" iconLeft={<Plus size={16} />} onClick={() => requireAuth(() => setCreateOpen(true), { intent: "create" })}>
            Create table
          </Button>
        </div>
        <div className="flex flex-col rounded-panel border border-border-subtle bg-surface-1 p-5 md:p-6">
          <h2 className="font-display text-[22px] font-bold text-text-primary">Challenge a player</h2>
          <p className="mt-1 text-[15px] text-text-secondary">Pick a rival from the leaderboard and send a direct challenge.</p>
          <Button href="/leaderboard" variant="secondary" className="mt-5 self-start" iconLeft={<Swords size={16} />}>
            Browse players
          </Button>
        </div>
      </section>

      {sheetOpen ? (
        <CreateTableSheet
          key={`${mode}-${initialMarket?.mint ?? ""}`}
          open
          initialMode={mode}
          initialMarket={initialMarket}
          initialVisibility={intent === "create-private" ? "private" : "public"}
          onOpenChange={(open) => {
            if (!open) {
              setCreateOpen(false);
              if (wantsCreate) clear();
            }
          }}
        />
      ) : null}
      {challengeSheet}
    </PageContainer>
  );
}
