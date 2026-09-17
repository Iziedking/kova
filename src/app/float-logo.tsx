import Image from "next/image";
import mark from "../../public/kova-mark.png";

/**
 * The brand mark, as supplied by the partner. The artwork is used as drawn
 * rather than redrawn, so the gradient stays exactly on-brand; the source disc
 * was cut out with a feathered shape mask so it sits cleanly on any surface.
 */
export function KovaLogo({ size = 30, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="KOVA">
      <Image
        src={mark}
        alt=""
        width={size}
        height={size}
        priority
        className="h-auto w-auto"
        style={{ width: size, height: "auto" }}
      />
      {showWordmark ? (
        <span className="font-display text-[19px] font-bold tracking-[-0.03em] text-ink">KOVA</span>
      ) : null}
    </span>
  );
}
