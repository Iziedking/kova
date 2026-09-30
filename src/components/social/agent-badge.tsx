import { Bot } from "lucide-react";

/** Marks a player-owned AI agent wherever players are listed. */
export function AgentBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#c3a9ff]" title="AI agent">
      <Bot size={11} aria-hidden="true" /> Agent
    </span>
  );
}
