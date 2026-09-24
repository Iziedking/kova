"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatAnsemRaw, formatDurationShort } from "@/lib/format";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { AnsemIcon } from "@/components/brand/ansem-icon";
import { AvatarStack } from "@/components/social/player-avatar";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicTableSummary, TableViewerState } from "@/types/competition";
import { CompetitionTimer } from "./competition-timer";
import { tableCta } from "./table-cta";
import { MODE_LABEL, ModeBadge } from "./mode-badge";
import { TableArt } from "./table-art";

export function TableCard({
  table,
  viewerState = "none",
  className,
}: {
  table: PublicTableSummary;
  viewerState?: TableViewerState;
  className?: string;
}) {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const cta = tableCta(table, viewerState);
  const href = `/tables/${encodeURIComponent(table.id)}`;
  const live = table.status === "active" || table.status === "settling";
  const subtitle = table.tagline ?? table.marketLabel;

  function onCta() {
    if (cta.kind === "join") {
      requireAuth(() => router.push(href), { next: `${href}?intent=join` });
    } else {
      router.push(href);
    }
  }

  return (
    <article
      aria-label={`${table.name}, ${MODE_LABEL[table.mode]}`}
      className={cn(
        "flex min-w-0 flex-col rounded-card border bg-surface-1 p-3.5 transition-colors duration-[120ms]",
        live ? "border-accent-line/70" : "border-border-subtle",
        "hover:border-border-strong",
        className,
      )}
    >
      <div className="flex gap-3.5">
        <div className="relative">
          <TableArt seed={table.id} mode={table.mode} className="h-[92px] w-[92px]" />
          <ModeBadge mode={table.mode} className="absolute left-1.5 top-1.5 backdrop-blur-sm" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            {live ? <LiveBadge /> : table.status === "open" ? <Badge tone="neutral">Open</Badge> : <Badge tone="warning">Starting</Badge>}
          </div>
          <h3 className="mt-1 truncate font-display text-[19px] font-bold leading-6 text-text-primary">{table.name}</h3>
          {subtitle ? <p className="truncate text-[13px] leading-5 text-text-secondary">{subtitle}</p> : null}

          <div className="mt-auto pt-2">
            {table.players.length > 0 ? (
              <AvatarStack players={table.players} total={table.filledSeats} max={4} size="sm" />
            ) : (
              <p className="num text-[12px] text-text-secondary">
                {table.filledSeats}/{table.maxPlayers} seated
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AnsemIcon size={30} />
          <div className="leading-tight">
            <p className="num text-[15px] font-semibold text-text-primary">{formatAnsemRaw(table.stakeAnsemRaw)}</p>
            <p className="text-[12px] text-text-secondary">stake each</p>
          </div>
        </div>

        {live && table.endsAt ? (
          <CompetitionTimer endsAt={table.endsAt} label="remaining" className="text-right" />
        ) : (
          <div className="text-right leading-tight">
            <p className="num text-[15px] font-semibold text-text-primary">{formatDurationShort(table.durationSeconds)}</p>
            <p className="text-[12px] text-text-secondary">match length</p>
          </div>
        )}
      </div>

      <Button
        variant={cta.kind === "none" ? "secondary" : "primary"}
        block
        className="mt-3.5"
        disabled={cta.kind === "none"}
        onClick={onCta}
        iconRight={cta.kind === "none" ? undefined : <ArrowRight size={16} />}
      >
        {cta.label}
      </Button>
    </article>
  );
}

/** Same geometry as `TableCard`, so the section doesn't shift when data arrives. */
export function TableCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-border-subtle bg-surface-1 p-3.5" aria-hidden="true">
      <div className="flex gap-3.5">
        <Skeleton className="h-[92px] w-[92px] shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="mt-auto h-7 w-24 rounded-full" />
        </div>
      </div>
      <div className="mt-3.5 flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-20" />
      </div>
      <Skeleton className="mt-3.5 h-11 w-full rounded-button" />
    </div>
  );
}
