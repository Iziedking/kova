"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** A small count shown after the label. */
  count?: number | string;
  icon?: ReactNode;
  disabled?: boolean;
}

type TabsVariant = "underline" | "pill" | "segmented";

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  variant?: TabsVariant;
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
  /** Stretch tabs to fill the container (segmented Buy/Sell). */
  fill?: boolean;
  /** Pair a `TabPanel` with the same `idBase`. */
  idBase?: string;
}

const LIST: Record<TabsVariant, string> = {
  underline: "gap-1 border-b border-border-subtle",
  pill: "gap-2",
  segmented: "gap-1 rounded-[11px] border border-border-subtle bg-surface-1 p-1",
};

function tabClass(variant: TabsVariant, active: boolean, fill?: boolean): string {
  const base = cn(
    "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-[14px] font-medium",
    "transition-colors duration-[160ms] disabled:cursor-not-allowed disabled:opacity-40",
    fill && "flex-1",
  );
  if (variant === "underline") {
    return cn(
      base,
      "h-11 px-3.5 -mb-px border-b-2",
      active ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
    );
  }
  if (variant === "pill") {
    return cn(
      base,
      "h-9 rounded-lg border px-3.5",
      active
        ? "border-accent-line bg-accent-soft text-[#d7c6ff]"
        : "border-border-subtle bg-surface-1 text-text-secondary hover:text-text-primary hover:border-border-strong",
    );
  }
  return cn(base, "h-9 rounded-lg px-4", active ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary");
}

export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  variant = "underline",
  label,
  className,
  fill,
  idBase,
}: TabsProps<T>) {
  const autoId = useId();
  const base = idBase ?? autoId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);
    const currentPosition = enabled.findIndex(({ item }) => item.value === value);
    let next = currentPosition;
    if (event.key === "ArrowRight") next = (currentPosition + 1) % enabled.length;
    else if (event.key === "ArrowLeft") next = (currentPosition - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[next];
    onValueChange(target.item.value);
    refs.current[target.index]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex items-center overflow-x-auto scrollbar-none", LIST[variant], className)}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.value}`}
            aria-selected={active}
            aria-controls={`${base}-panel-${item.value}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            className={tabClass(variant, active, fill)}
          >
            {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-md bg-surface-3 px-1.5 text-[11px] text-text-secondary">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  active,
  children,
  className,
}: {
  idBase: string;
  value: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} className={className}>
      {children}
    </div>
  );
}
