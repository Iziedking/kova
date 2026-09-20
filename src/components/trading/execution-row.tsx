import { cn } from "@/lib/cn";
import { formatUsd, formatUsdPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { Trade } from "@/types/trading";

const STATUS: Record<Trade["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  draft: { label: "Draft", tone: "neutral" },
  awaiting_wallet: { label: "Awaiting wallet", tone: "warning" },
  submitted: { label: "Submitted", tone: "warning" },
  confirming: { label: "Confirming", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** One of the viewer's own executions. Only the backend's status is shown. */
export function ExecutionRow({ trade }: { trade: Trade }) {
  const status = STATUS[trade.status];
  const buy = trade.side === "buy";
  return (
    <tr className="border-t border-border-subtle text-[13px]">
      <td className="num py-2.5 pr-3 text-text-secondary">{clock(trade.createdAt)}</td>
      <td className={cn("py-2.5 pr-3 font-semibold", buy ? "text-success" : "text-danger")}>{buy ? "Buy" : "Sell"}</td>
      <td className="num py-2.5 pr-3 text-text-primary">{trade.outputAmount ?? "—"}</td>
      <td className="num py-2.5 pr-3 text-text-primary">{formatUsdPrice(trade.effectivePriceUsd)}</td>
      <td className="num py-2.5 pr-3 text-text-secondary">{formatUsd(trade.feeUsd, { cents: true })}</td>
      <td className="py-2.5 text-right">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
    </tr>
  );
}
