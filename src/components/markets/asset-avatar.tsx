import Image from "next/image";
import { cn } from "@/lib/cn";

function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) out = Math.imul(out ^ char.charCodeAt(0), 16777619) >>> 0;
  return out;
}

const TINTS = ["#3a2a63", "#123c30", "#4a1f18", "#152f4b", "#40301a", "#3f193f", "#1e2350", "#48182f"];

const SIZE = {
  sm: { box: "h-8 w-8 rounded-lg", text: "text-[10px]", px: 32 },
  md: { box: "h-10 w-10 rounded-[10px]", text: "text-[12px]", px: 40 },
  lg: { box: "h-12 w-12 rounded-xl", text: "text-[14px]", px: 48 },
  xl: { box: "h-16 w-16 rounded-2xl", text: "text-[18px]", px: 64 },
} as const;

/**
 * Token icon. A missing or failed image falls back to a tinted symbol tile, so
 * a null `imageUrl` never breaks layout (blueprint 7.11).
 */
export function AssetAvatar({
  symbol,
  imageUrl,
  size = "md",
  className,
}: {
  symbol: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const spec = SIZE[size];
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden border border-border-subtle", spec.box, className)}
      style={imageUrl ? undefined : { backgroundColor: TINTS[hash(symbol) % TINTS.length] }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={spec.px} height={spec.px} unoptimized className="h-full w-full object-cover" />
      ) : (
        <span className={cn("font-display font-bold tracking-tight text-white/90", spec.text)}>
          {symbol.slice(0, symbol.length > 4 ? 3 : 4).toUpperCase()}
        </span>
      )}
    </span>
  );
}
