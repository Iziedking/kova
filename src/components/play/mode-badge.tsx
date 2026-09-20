import { CandlestickChart, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CompetitionMode } from "@/types/competition";

export const MODE_LABEL: Record<CompetitionMode, string> = {
  prediction: "Predict",
  trading: "Trade",
};

/**
 * The single, always-visible answer to "which mode is this?". Predict is the
 * brand violet; Trade is the semantic green family, matching the mockups.
 */
export function ModeBadge({ mode, className }: { mode: CompetitionMode; className?: string }) {
  return mode === "prediction" ? (
    <Badge tone="accent" icon={<Sparkles size={12} />} className={className}>
      {MODE_LABEL[mode]}
    </Badge>
  ) : (
    <Badge tone="success" icon={<CandlestickChart size={12} />} className={className}>
      {MODE_LABEL[mode]}
    </Badge>
  );
}
