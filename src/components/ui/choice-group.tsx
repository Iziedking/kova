"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Choice<T extends string | number> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}

/**
 * A radiogroup rendered as buttons: stake presets, durations, player counts,
 * Public/Private. Fully keyboard operable (Tab into the group, arrows to change).
 */
export function ChoiceGroup<T extends string | number>({
  label,
  choices,
  value,
  onChange,
  columns,
  className,
  size = "md",
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: number;
  className?: string;
  size?: "md" | "lg";
}) {
  const groupId = useId();
  const selectedIndex = choices.findIndex((choice) => choice.value === value);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const enabled = choices.filter((choice) => !choice.disabled);
    const position = enabled.findIndex((choice) => choice.value === value);
    let next = position;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (position + 1) % enabled.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (position - 1 + enabled.length) % enabled.length;
    else return;
    event.preventDefault();
    onChange(enabled[next].value);
  }

  return (
    <div className={className}>
      <p id={`${groupId}-label`} className="mb-2 text-[13px] font-semibold text-text-primary">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        onKeyDown={onKeyDown}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns ?? choices.length}, minmax(0, 1fr))` }}
      >
        {choices.map((choice, index) => {
          const selected = choice.value === value;
          return (
            <button
              key={String(choice.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={choice.disabled}
              tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
              onClick={() => onChange(choice.value)}
              className={cn(
                "flex flex-col items-center justify-center rounded-input border px-2 text-center transition-colors duration-[160ms]",
                size === "lg" ? "min-h-[64px] py-2.5" : "h-11",
                selected
                  ? "border-accent bg-accent-soft text-text-primary"
                  : "border-border-strong bg-surface-1 text-text-secondary hover:border-[#454858] hover:text-text-primary",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <span className="text-[14px] font-semibold">{choice.label}</span>
              {choice.hint ? <span className="mt-0.5 text-[12px] font-normal text-text-secondary">{choice.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
