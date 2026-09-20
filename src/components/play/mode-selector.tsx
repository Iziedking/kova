import type { CompetitionMode } from "@/types/competition";
import { GameModeCard } from "./game-mode-card";

/** Predict / Trade. Two cards, not twenty game modes. */
export function ModeSelector({
  value,
  onChange,
  onPlay,
}: {
  value: CompetitionMode;
  onChange: (mode: CompetitionMode) => void;
  onPlay: (mode: CompetitionMode) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2" role="group" aria-label="Game mode">
      {(["prediction", "trading"] as const).map((mode) => (
        <GameModeCard key={mode} mode={mode} selected={value === mode} onSelect={() => onChange(mode)} onPlay={() => onPlay(mode)} />
      ))}
    </div>
  );
}
