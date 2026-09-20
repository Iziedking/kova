"use client";

import { ChevronLeft, Lock, Globe } from "lucide-react";
import Link from "next/link";
import { formatAnsemRaw, formatDurationShort } from "@/lib/format";
import { AnsemIcon } from "@/components/brand/ansem-icon";
import { CompetitionTimer } from "@/components/play/competition-timer";
import { ModeBadge } from "@/components/play/mode-badge";
import { PotDisplay } from "@/components/play/pot-display";
import { Badge, LiveBadge } from "@/components/ui/badge";
import type { TableDetail } from "@/types/competition";

const STATUS_LABEL: Record<TableDetail["status"], string> = {
  open: "Open",
  waiting: "Starting",
  active: "Live",
  settling: "Settling",
  settled: "Settled",
  cancelled: "Cancelled",
};

/**
 * The table's identity strip: mode, name, stake, pot and the clock. Shared by the
 * waiting room and the active match so the frame never changes between states.
 */
export function TableHeader({
  table,
  readAt,
  showTimer = true,
}: {
  table: TableDetail;
  readAt?: number;
  showTimer?: boolean;
}) {
  const live = table.status === "active";
  return (
    <header className="space-y-4">
      <Link href="/play" className="inline-flex items-center gap-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary max-md:hidden">
        <ChevronLeft size={15} aria-hidden="true" /> Play
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={table.mode} />
            {live ? <LiveBadge /> : <Badge tone={table.status === "cancelled" ? "danger" : "neutral"}>{STATUS_LABEL[table.status]}</Badge>}
            <Badge tone="outline" icon={table.visibility === "private" ? <Lock size={11} /> : <Globe size={11} />}>
              {table.visibility === "private" ? "Private" : "Public"}
            </Badge>
          </div>
          <h1 className="mt-2.5 truncate font-display text-[30px] font-bold leading-9 tracking-[-0.02em] text-text-primary md:text-[36px] md:leading-[42px]">
            {table.name}
          </h1>
          {table.marketLabel ? <p className="mt-1 text-[14px] text-text-secondary">{table.marketLabel}</p> : null}
        </div>

        <dl className="flex items-center gap-6 md:gap-8">
          <div>
            <dt className="text-[12px] text-text-secondary">Stake each</dt>
            <dd className="mt-0.5 flex items-center gap-1.5">
              <AnsemIcon size={20} />
              <span className="num text-[16px] font-semibold text-text-primary">{formatAnsemRaw(table.stakeAnsemRaw)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-text-secondary">Pot</dt>
            <dd className="mt-0.5">
              <PotDisplay potRaw={table.potAnsemRaw} size="sm" />
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-text-secondary">{live && showTimer ? "Remaining" : "Match length"}</dt>
            <dd className="mt-0.5">
              {live && showTimer ? (
                <CompetitionTimer endsAt={table.endsAt} serverTime={table.serverTime} readAt={readAt} format="clock" showIcon={false} />
              ) : (
                <span className="num text-[16px] font-semibold text-text-primary">{formatDurationShort(table.durationSeconds)}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
