import Image from "next/image";
import mark from "../../public/brand/kova-app-icon.jpg";

/** The KOVA app icon (chip and sparkle), used as drawn, beside the wordmark. */
export function KovaLogo({ size = 30, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="KOVA">
      <Image src={mark} alt="" width={size} height={size} priority className="rounded-[22%]" style={{ width: size, height: size }} />
      {showWordmark ? (
        <span className="font-display text-[19px] font-bold tracking-[-0.03em] text-ink">KOVA</span>
      ) : null}
    </span>
  );
}
