import { AnsemIcon } from "@/components/brand/ansem-icon";
import { cn } from "@/lib/cn";
import { formatAnsemRaw } from "@/lib/format";

/** The prize pot. ANSEM amounts arrive as raw base-unit strings and are never floated. */
export function PotDisplay({
  potRaw,
  size = "md",
  align = "left",
  caption,
  className,
}: {
  potRaw: string | null;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center";
  caption?: string;
  className?: string;
}) {
  const sizes = { sm: "text-[15px]", md: "text-[18px]", lg: "text-[24px]" } as const;
  return (
    <div className={cn("flex flex-col", align === "center" && "items-center text-center", className)}>
      <div className="flex items-center gap-2">
        <AnsemIcon size={size === "lg" ? 26 : 22} />
        <span className={cn("num font-semibold text-text-primary", sizes[size])}>{formatAnsemRaw(potRaw)}</span>
      </div>
      {caption ? <p className="mt-0.5 text-[12px] text-text-secondary">{caption}</p> : null}
    </div>
  );
}
