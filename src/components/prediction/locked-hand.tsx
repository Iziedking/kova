import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A face-down card. It intentionally carries no information about the pick -
 * not a symbol, colour or hash - so it can never leak a hidden selection.
 */
export function LockedHand({ locked = true, size = "md", className }: { locked?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "lg" ? "h-[132px] w-[92px]" : size === "sm" ? "h-[68px] w-[48px]" : "h-[104px] w-[74px]";
  return (
    <div
      role="img"
      aria-label={locked ? "Pick locked" : "No pick yet"}
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-xl border",
        locked ? "border-accent-line bg-accent-soft" : "border-dashed border-border-strong bg-surface-2",
        box,
        className,
      )}
    >
      {locked ? (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-30"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, #9b6cff 0 1px, transparent 1px 9px)" }}
          />
          <Lock size={size === "sm" ? 16 : 24} className="relative text-[#c3a9ff]" aria-hidden="true" />
        </>
      ) : (
        <span className="text-[11px] text-text-muted">Empty</span>
      )}
    </div>
  );
}
