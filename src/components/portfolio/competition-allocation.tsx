import Link from "next/link";
import { formatUsd } from "@/lib/format";
import { LiveBadge } from "@/components/ui/badge";
import { PriceChange } from "@/components/markets/price-change";
import { TableArt } from "@/components/play/table-art";
import type { CompetitionAllocation as Allocation } from "@/types/portfolio";

/** Which capital is tied to which live match. Return is the match's net PnL %. */
export function CompetitionAllocation({ allocation }: { allocation: Allocation }) {
  return (
    <li>
      <Link href={`/tables/${encodeURIComponent(allocation.tableId)}`} className="flex items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-surface-2">
        <TableArt seed={allocation.tableId} mode="trading" className="h-12 w-12 !rounded-lg [&_svg]:h-5 [&_svg]:w-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-text-primary">{allocation.tableName}</p>
            {allocation.status === "live" ? <LiveBadge /> : <span className="text-[12px] text-text-secondary">Settling</span>}
          </div>
          {allocation.marketLabel ? <p className="truncate text-[12px] text-text-secondary">{allocation.marketLabel}</p> : null}
        </div>
        <div className="text-right">
          <p className="num text-[15px] font-semibold text-text-primary">{formatUsd(allocation.allocatedUsd)}</p>
          <p className="text-[12px]"><PriceChange value={allocation.returnPct} /> <span className="text-text-muted">return</span></p>
        </div>
      </Link>
    </li>
  );
}
