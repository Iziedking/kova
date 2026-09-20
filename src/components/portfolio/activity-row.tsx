import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Coins, ShoppingCart, Trophy, type LucideIcon } from "lucide-react";
import { formatTimeAgo } from "@/lib/format";
import type { PortfolioActivityItem } from "@/types/portfolio";

const ICON: Record<PortfolioActivityItem["kind"], LucideIcon> = {
  buy: ShoppingCart,
  sell: Coins,
  join: Trophy,
  swap: ArrowLeftRight,
  receive: ArrowDownToLine,
  send: ArrowUpFromLine,
  payout: Trophy,
};

/** One confirmed event. The list only ever contains confirmed activity (blueprint 29). */
export function ActivityRow({ item }: { item: PortfolioActivityItem }) {
  const Icon = ICON[item.kind];
  const positive = item.kind === "receive" || item.kind === "payout";
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-text-secondary">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-text-primary">{item.title}</p>
        <p className={positive ? "num truncate text-[13px] text-success" : "num truncate text-[13px] text-text-secondary"}>{item.detail}</p>
      </div>
      <span className="shrink-0 text-[12px] text-text-muted">{formatTimeAgo(item.at)}</span>
    </li>
  );
}
