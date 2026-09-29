"use client";

import { ChevronRight, Crown, Swords } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatAnsemRaw, formatPct, formatUsdPrice } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { MiniPriceChart } from "@/components/markets/mini-price-chart";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The landing and sign-in card: live data only. The market row is the top stock meme with its real
 * price and hourly candles; the match row is the latest settled showdown, or an open table, or an
 * invitation to start one. Nothing here is invented, and every link goes somewhere real.
 */
export function AuthProductPreview({ compact = false, className }: { compact?: boolean; className?: string }) {
  const stocks = useResource((s) => s.markets.memeStocks({ limit: 1 }), [], { refreshMs: 60_000 });
  const asset = stocks.state.status === "ready" ? stocks.state.data.assets[0] ?? null : null;
  const candles = useResource((s) => s.markets.candles(asset!.mint, "1h"), [asset?.mint], { enabled: asset !== null, refreshMs: 120_000 });
  const showdowns = useResource((s) => s.social.recentShowdowns(), [], { refreshMs: 60_000 });
  const tables = useResource((s) => s.competitions.listTables({ status: "open", limit: 1 }), [], { refreshMs: 30_000 });

  const showdown = showdowns.state.status === "ready" ? showdowns.state.data[0] ?? null : null;
  const openTable = tables.state.status === "ready" ? tables.state.data[0] ?? null : null;
  const spark = candles.state.status === "ready" ? candles.state.data.slice(-24).map((candle) => candle.close) : null;
  const up = (asset?.change24hPct ?? 0) >= 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-card border border-border-subtle bg-surface-1/90 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {compact ? null : <Badge tone="accent">Predict</Badge>}
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
              <span className="sm:hidden">Live · devnet</span>
              <span className="hidden sm:inline">Live on Solana devnet</span>
            </span>
          </div>
          <Link href="/markets" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-text-primary hover:underline">
            Meme stocks
            <ChevronRight size={14} className="text-text-muted" aria-hidden="true" />
          </Link>
        </div>

        {showdown ? (
          <Link href={`/tables/${encodeURIComponent(showdown.id)}`} className="flex items-center justify-between gap-3 rounded-lg transition-colors hover:bg-surface-2/60">
            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar username={showdown.winner} src={showdown.winnerAvatarUrl} size={compact ? "md" : "lg"} />
              <div className="min-w-0">
                <p className="truncate text-[13px] text-text-primary">{showdown.winner}</p>
                <p className={cn("num font-semibold text-success", compact ? "text-[15px]" : "text-[20px]")}>+{formatAnsemRaw(showdown.payoutAnsemRaw)}</p>
              </div>
            </div>
            <span className="text-[13px] font-medium text-text-muted">beat</span>
            <div className="min-w-0 text-right">
              <p className="truncate text-[13px] text-text-primary">{showdown.loser}</p>
              <p className="truncate text-[12px] text-text-secondary">{showdown.tableName}</p>
            </div>
          </Link>
        ) : showdowns.state.status === "loading" ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent"><Swords size={20} aria-hidden="true" /></span>
              <div>
                <p className="text-[14px] font-semibold text-text-primary">{openTable ? openTable.name : "No match running yet"}</p>
                <p className="text-[12px] text-text-secondary">
                  {openTable ? `${openTable.filledSeats}/${openTable.maxPlayers} seated · waiting for players` : "Pick a meme stock, stake ANSEM, beat another player."}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          {asset ? (
            <Link href={`/markets/${encodeURIComponent(asset.mint)}`} className="flex min-w-0 items-center gap-2.5">
              <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-text-primary">${asset.symbol}</p>
                <p className="num text-[12px] text-text-secondary">
                  {formatUsdPrice(asset.priceUsd)} <span className={up ? "text-success" : "text-danger"}>{formatPct(asset.change24hPct, { digits: 1, signed: true })}</span>
                </p>
              </div>
            </Link>
          ) : (
            <Skeleton className="h-9 w-32" />
          )}
          {spark && spark.length > 1 ? <MiniPriceChart points={spark} direction={up ? "up" : "down"} width={compact ? 64 : 120} height={32} /> : <span />}
          <div className="text-right">
            <p className="num text-[13px] font-semibold text-text-primary">{openTable ? formatAnsemRaw(openTable.stakeAnsemRaw) : "1–10 ANSEM"}</p>
            <p className="text-[12px] text-text-secondary">{openTable ? "stake to join" : "stake per player"}</p>
          </div>
        </div>
      </div>

      {compact ? null : (
        <div className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-1/90 px-4 py-3 backdrop-blur-sm">
          <Crown size={28} className="shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-[13px] leading-5">
            <p className="text-text-primary">{openTable ? "A table is open right now." : showdown ? `${showdown.winner} took the last pot.` : "Be the first on the leaderboard."}</p>
            <p className="text-text-secondary">{openTable ? "Take a seat before it fills." : "Start a table and invite someone."}</p>
          </div>
          <Button
            href={openTable ? `/tables/${encodeURIComponent(openTable.id)}` : "/play?intent=create"}
            variant="outline"
            size="sm"
            iconRight={<ChevronRight size={14} />}
          >
            {openTable ? "Join table" : "Start a table"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function BrowseFirstLink({ label = "Browse markets without signing in", className }: { label?: string; className?: string }) {
  return (
    <Link
      href="/markets"
      className={cn("inline-flex items-center gap-2 text-[14px] font-medium text-[#b79bff] transition-colors hover:text-[#d0bdff]", className)}
    >
      <span className="underline underline-offset-4 decoration-[#b79bff]/40">{label}</span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}
