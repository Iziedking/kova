import { Flame } from "lucide-react";

export function StreakBadge({ streak }: { streak: number | null | undefined }) {
  if (!streak || streak < 2) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning">
      <Flame size={12} aria-hidden="true" />
      {streak}-win streak
    </span>
  );
}
