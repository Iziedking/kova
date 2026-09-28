"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/toast";

/** A labelled value (email, wallet address) that copies its full text on click. */
export function CopyValue({ label, value, display, className }: { label: string; value: string; display?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      title={value}
      className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-3", className)}
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-text-muted">{label}</span>
        <span className="num block truncate text-[13px] text-text-primary">{display ?? value}</span>
      </span>
      {copied ? <Check size={15} className="shrink-0 text-success" aria-hidden="true" /> : <Copy size={15} className="shrink-0 text-text-secondary" aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </button>
  );
}
