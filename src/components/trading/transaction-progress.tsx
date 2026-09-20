import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TradeFlowStatus } from "@/types/trading";

const STEPS: Array<{ status: TradeFlowStatus; label: string; detail: string }> = [
  { status: "preparing", label: "Preparing", detail: "Building your trade" },
  { status: "awaiting_wallet", label: "Wallet approval", detail: "Approve the request in your wallet" },
  { status: "submitted", label: "Submitted", detail: "Sent to Solana" },
  { status: "confirming", label: "Confirming", detail: "Waiting for onchain confirmation" },
  { status: "confirmed", label: "Confirmed", detail: "Your fill is verified" },
];

/**
 * The transaction lifecycle, one row per stage. Each stage has its own state, so
 * a slow wallet or a slow confirmation is visible as exactly that and never as
 * one indefinite spinner (blueprint 20). On failure the failed stage is marked.
 */
export function TransactionProgress({ status, failedAt }: { status: TradeFlowStatus; failedAt?: TradeFlowStatus }) {
  const currentIndex = STEPS.findIndex((step) => step.status === (status === "failed" ? failedAt : status));
  return (
    <ol className="space-y-3" aria-label="Transaction progress">
      {STEPS.map((step, index) => {
        const failed = status === "failed" && index === (currentIndex === -1 ? 0 : currentIndex);
        const done = status === "confirmed" || (currentIndex > index && status !== "failed") || (status === "failed" && index < currentIndex);
        const active = !failed && !done && index === currentIndex;
        return (
          <li key={step.status} className="flex items-start gap-3" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px]",
                done && "border-success/40 bg-success-soft text-success",
                active && "border-accent-line bg-accent-soft text-accent",
                failed && "border-danger/50 bg-danger-soft text-danger",
                !done && !active && !failed && "border-border-strong text-text-muted",
              )}
            >
              {done ? <Check size={13} aria-hidden="true" /> : active ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : failed ? <AlertCircle size={13} aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[14px] font-medium", done || active ? "text-text-primary" : failed ? "text-danger" : "text-text-muted")}>{step.label}</span>
              <span className="block text-[12px] text-text-secondary">{step.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
