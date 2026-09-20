import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatAnsemRaw, formatTimeAgo } from "@/lib/format";
import { PriceChange } from "@/components/markets/price-change";
import { ModeBadge } from "@/components/play/mode-badge";
import { Badge } from "@/components/ui/badge";
import type { MatchHistoryItem } from "@/types/social";

const RESULT = {
  won: { label: "Won", tone: "success" as const },
  lost: { label: "Lost", tone: "danger" as const },
  draw: { label: "Draw", tone: "neutral" as const },
  voided: { label: "Voided", tone: "warning" as const },
};

export function MatchHistoryRow({ item }: { item: MatchHistoryItem }) {
  const result = RESULT[item.result];
  return (
    <li>
      <Link
        href={`/tables/${encodeURIComponent(item.tableId)}`}
        className="flex items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-surface-2 md:px-3"
      >
        <Badge tone={result.tone} className="w-[52px] justify-center">{result.label}</Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-text-primary">{item.tableName}</p>
          <p className="truncate text-[12px] text-text-secondary">
            vs {item.opponents.map((name) => `@${name}`).join(", ")} · {formatTimeAgo(item.settledAt)}
          </p>
        </div>
        <ModeBadge mode={item.mode} className="hidden sm:inline-flex" />
        <div className={cn("w-[84px] shrink-0 text-right")}>
          <PriceChange value={item.returnPct} className="text-[14px]" />
          {item.payoutAnsemRaw ? <p className="num text-[12px] text-success">+{formatAnsemRaw(item.payoutAnsemRaw)}</p> : null}
        </div>
      </Link>
    </li>
  );
}
