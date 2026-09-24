import { Bot } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTimeAgo } from "@/lib/format";
import type { DealerMessageItem } from "@/types/competition";

/**
 * The Dealer speaks at market level and never reveals a hidden pick. Present but
 * subordinate: a small robot mark and plain text, not an "AI dashboard".
 */
export function DealerMessage({ message, className }: { message: DealerMessageItem; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft text-accent">
        <Bot size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#b79bff]">
          Dealer <span className="ml-1 font-normal text-text-muted">{formatTimeAgo(message.at)}</span>
        </p>
        <p className={cn("text-[14px] leading-5", message.tone === "warning" ? "text-warning" : "text-text-primary")}>{message.text}</p>
      </div>
    </div>
  );
}
