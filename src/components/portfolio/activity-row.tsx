import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Coins, ExternalLink, Flag, PlusCircle, ShoppingCart, Swords, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { formatTimeAgo } from "@/lib/format";
import { KOVA_SOLANA_CHAIN } from "@/wallet/chain";
import type { PortfolioActivityItem } from "@/types/portfolio";

const ICON: Record<PortfolioActivityItem["kind"], LucideIcon> = {
  buy: ShoppingCart,
  sell: Coins,
  join: Trophy,
  swap: ArrowLeftRight,
  receive: ArrowDownToLine,
  send: ArrowUpFromLine,
  payout: Trophy,
  create: PlusCircle,
  challenge: Swords,
  result: Flag,
};

function explorerUrl(signature: string): string {
  const cluster = KOVA_SOLANA_CHAIN === "solana:devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${cluster}`;
}

/** One event in the player's history. Opens the table it happened at; a transaction links to the explorer. */
export function ActivityRow({ item }: { item: PortfolioActivityItem }) {
  const Icon = ICON[item.kind];
  const positive = item.kind === "receive" || item.kind === "payout";
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-2 text-text-secondary">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-text-primary">{item.title}</p>
        <p className={positive ? "num truncate text-[13px] text-success" : "num truncate text-[13px] text-text-secondary"}>{item.detail}</p>
      </div>
    </>
  );
  return (
    <li className="flex items-center gap-3 py-3">
      {item.href ? (
        <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors hover:bg-surface-2/60">{body}</Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[12px] text-text-muted">{formatTimeAgo(item.at)}</span>
        {item.txSignature ? (
          <a href={explorerUrl(item.txSignature)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
            Tx <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </li>
  );
}
