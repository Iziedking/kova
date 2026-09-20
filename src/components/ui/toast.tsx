"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((notify) => notify());
}

function push(tone: ToastTone, message: string, ms = 4500): number {
  const id = nextId++;
  items = [...items, { id, tone, message }].slice(-3);
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismiss(id), ms);
  }
  return id;
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

/** Imperative API: `toast.success("Table created")`. Mount `<Toaster />` once in the shell. */
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message, 6500),
  info: (message: string) => push("info", message),
  dismiss,
};

const EMPTY: ToastItem[] = [];

const ICON = {
  success: <CheckCircle2 size={18} className="text-success" aria-hidden="true" />,
  error: <AlertCircle size={18} className="text-danger" aria-hidden="true" />,
  info: <Info size={18} className="text-accent" aria-hidden="true" />,
};

export function Toaster() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => EMPTY,
  );

  useEffect(() => () => undefined, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+12px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
    >
      {list.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-xl border bg-surface-2 px-4 py-3 shadow-popover animate-rise-in",
            item.tone === "error" ? "border-danger/40" : "border-border-strong",
          )}
        >
          <span className="mt-0.5 shrink-0">{ICON[item.tone]}</span>
          <p className="min-w-0 flex-1 text-[14px] text-text-primary">{item.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(item.id)}
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
