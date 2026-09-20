"use client";

import { Crown, RotateCcw, Share2, Swords } from "lucide-react";
import Link from "next/link";
import { formatAnsemRaw } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { RevealCard } from "@/components/prediction/reveal-card";
import { ResultHero } from "@/components/play/result-hero";
import { PriceChange } from "@/components/markets/price-change";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Button } from "@/components/ui/button";
import { ResourceView } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { ShowdownResult } from "@/types/competition";
import { useChallenge } from "./use-challenge";

const ORDINAL = ["", "1st", "2nd", "3rd"];

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 text-center">
      <p className="text-[12px] text-text-secondary">{label}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[18px] font-semibold text-text-primary">{children}</p>
    </div>
  );
}

function Result({ result }: { result: ShowdownResult }) {
  const { challenge, sheet } = useChallenge();
  const viewer = result.standings.find((row) => row.isViewer) ?? null;
  const winner = result.standings[0] ?? null;
  const won = viewer?.rank === 1;
  const outcome = won ? "won" : viewer ? "lost" : "spectator";
  const headline = won ? "You won!" : viewer ? `You finished ${ORDINAL[viewer.rank] ?? `#${viewer.rank}`}` : winner ? `@${winner.username} wins` : "Settled";
  const shownPct = (viewer ?? winner)?.netPnlPct ?? null;
  const payoutRaw = result.viewerPayoutAnsemRaw;
  const hasPayout = payoutRaw !== null && payoutRaw !== "0";
  const payoutLabel = hasPayout ? `${result.payoutStatus === "paid" ? "+" : ""}${formatAnsemRaw(payoutRaw)}` : null;
  const payoutNote =
    result.payoutStatus === "paid" ? "Added to your wallet" : result.payoutStatus === "pending" ? "Payout pending - not sent yet" : result.payoutStatus === "refunded" ? "Refunded" : null;
  const opponent = result.standings.find((row) => !row.isViewer)?.username ?? null;
  const modeLabel = result.mode === "prediction" ? "Predict" : "Trade";

  async function share() {
    const url = `${window.location.origin}/tables/${encodeURIComponent(result.tableId)}`;
    const text = won ? `I won ${result.tableName} on Kova.` : `${result.tableName} on Kova.`;
    try {
      if (navigator.share) await navigator.share({ title: "Kova showdown", text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Result link copied");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Couldn't share this result.");
    }
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-8 pb-6">
      <ResultHero outcome={outcome} headline={headline} returnPct={shownPct} payoutLabel={payoutLabel} payoutNote={payoutNote} />

      {result.reveals ? (
        <section aria-labelledby="reveals-title">
          <h2 id="reveals-title" className="mb-3 font-display text-[18px] font-bold text-text-primary">The reveal</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {result.reveals.map((pick, index) => (
              <RevealCard key={pick.username} pick={pick} index={index} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Final standings">
        <ol className="flex items-start justify-center gap-4 overflow-x-auto pb-1 scrollbar-none sm:gap-6">
          {result.standings.slice(0, 5).map((row) => (
            <li key={row.username} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 text-center">
              <span className="relative">
                <PlayerAvatar username={row.username} src={row.avatarUrl} size="lg" ring={row.rank === 1} />
                <span className="num absolute -bottom-1 left-1/2 grid h-5 min-w-5 -translate-x-1/2 place-items-center rounded-full bg-surface-3 px-1 text-[11px] font-semibold text-text-primary ring-2 ring-bg">
                  {row.rank}
                </span>
              </span>
              <p className="w-full truncate pt-1 text-[12px] font-medium text-text-primary">{row.isViewer ? "You" : row.username}</p>
              <PriceChange value={row.netPnlPct} className="text-[12px]" />
            </li>
          ))}
        </ol>
      </section>

      <dl className="grid grid-cols-3 divide-x divide-border-subtle rounded-card border border-border-subtle bg-surface-1 py-4">
        <Stat label="Total players">
          <span className="num">{result.totalPlayers}</span>
        </Stat>
        <Stat label="Your rank">
          {viewer ? (
            <>
              {viewer.rank === 1 ? <Crown size={16} className="text-accent" aria-hidden="true" /> : null}
              <span className="num">#{viewer.rank}</span>
            </>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="Match type">
          <span className={result.mode === "trading" ? "text-success" : "text-[#b79bff]"}>{modeLabel}</span>
        </Stat>
      </dl>

      <p className="text-center font-display text-[18px] italic text-text-secondary">&ldquo;Same Markets. A More Social Game.&rdquo;</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button href={`/play?mode=${result.mode === "trading" ? "trade" : "predict"}`} size="lg" iconLeft={<RotateCcw size={17} />}>
          Play again
        </Button>
        <Button variant="secondary" size="lg" iconLeft={<Share2 size={17} />} onClick={() => void share()}>
          Share result
        </Button>
        {opponent ? (
          <Button variant="outline" iconLeft={<Swords size={16} />} onClick={() => challenge(opponent)}>
            Challenge @{opponent} again
          </Button>
        ) : null}
        <Link href="/leaderboard" className="inline-flex h-11 items-center justify-center rounded-button text-[14px] font-semibold text-text-secondary transition-colors hover:text-text-primary">
          View leaderboard
        </Link>
      </div>
      {sheet}
    </div>
  );
}

/** Showdown / result for a settled table in either mode (blueprint 13 and mobile result screen). */
export function ShowdownScreen({ tableId }: { tableId: string }) {
  const { state, refetch } = useResource((s) => s.competitions.showdown(tableId), [tableId]);
  return (
    <ResourceView
      state={state}
      onRetry={refetch}
      errorTitle="The result couldn't load"
      pendingTitle="Results aren't connected yet"
      loading={
        <div className="mx-auto max-w-[760px] space-y-6 pt-10" aria-hidden="true">
          <Skeleton className="mx-auto h-14 w-2/3" />
          <Skeleton className="mx-auto h-14 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      {(result) => <Result result={result} />}
    </ResourceView>
  );
}
