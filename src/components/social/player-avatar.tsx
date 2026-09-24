import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/format";

/**
 * Identity is a person, never a wallet. Until a player supplies an image, the
 * avatar is a deterministic tint derived from the username - the same person
 * always gets the same colour, and nothing is fetched or invented.
 */
const PALETTE: Array<[string, string]> = [
  ["#7c4dff", "#3a2a63"],
  ["#2f9e7a", "#123c30"],
  ["#c2543f", "#4a1f18"],
  ["#3b82c4", "#152f4b"],
  ["#b5854a", "#40301a"],
  ["#a24ea3", "#3f193f"],
  ["#5b6ad0", "#1e2350"],
  ["#c25b86", "#48182f"],
];

function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) out = Math.imul(out ^ char.charCodeAt(0), 16777619) >>> 0;
  return out;
}

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE: Record<AvatarSize, { box: string; text: string; px: number }> = {
  xs: { box: "h-6 w-6", text: "text-[9px]", px: 24 },
  sm: { box: "h-8 w-8", text: "text-[11px]", px: 32 },
  md: { box: "h-10 w-10", text: "text-[13px]", px: 40 },
  lg: { box: "h-14 w-14", text: "text-[18px]", px: 56 },
  xl: { box: "h-[72px] w-[72px]", text: "text-[24px]", px: 72 },
};

export function PlayerAvatar({
  username,
  src,
  size = "md",
  ring,
  verified,
  className,
}: {
  username: string;
  src?: string | null;
  size?: AvatarSize;
  ring?: boolean;
  verified?: boolean;
  className?: string;
}) {
  const [from, to] = PALETTE[hash(username.toLowerCase()) % PALETTE.length];
  const spec = SIZE[size];
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", spec.box, ring && "ring-2 ring-accent/70 ring-offset-2 ring-offset-bg", className)}
      style={src ? undefined : { backgroundImage: `linear-gradient(140deg, ${from}, ${to})` }}
      role="img"
      aria-label={`${username}'s avatar`}
    >
      {src ? (
        <Image src={src} alt="" width={spec.px} height={spec.px} unoptimized className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className={cn("font-display font-bold text-white/90", spec.text)}>{initialsOf(username)}</span>
      )}
      {verified ? (
        <BadgeCheck
          size={size === "xs" || size === "sm" ? 11 : 14}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-bg text-info"
          aria-label="Verified"
        />
      ) : null}
    </span>
  );
}

/** Overlapping avatars with a `+N` remainder, as on table cards. */
export function AvatarStack({
  players,
  total,
  max = 4,
  size = "sm",
}: {
  players: Array<{ username: string; avatarUrl: string | null }>;
  /** Total seats filled, which may exceed the identified players. */
  total?: number;
  max?: number;
  size?: AvatarSize;
}) {
  const shown = players.slice(0, max);
  const known = Math.max(total ?? players.length, players.length);
  const rest = known - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((player, index) => (
        <PlayerAvatar
          key={`${player.username}-${index}`}
          username={player.username}
          src={player.avatarUrl}
          size={size}
          className={cn("ring-2 ring-surface-1", index > 0 && "-ml-2")}
        />
      ))}
      {rest > 0 ? (
        <span className="ml-1.5 text-[12px] font-medium text-text-secondary">+{rest}</span>
      ) : null}
    </div>
  );
}
