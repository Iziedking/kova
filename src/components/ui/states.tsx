"use client";

import { AlertTriangle, CloudOff, Inbox, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ResourceState } from "@/hooks/use-resource";
import { Button } from "./button";

/**
 * The state vocabulary every section shares: loading, empty, error, pending.
 * Errors are local to the section (blueprint 33): one failing feed never blanks
 * the page around it.
 */
function StateShell({ icon, title, body, action, className, compact }: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong bg-surface-1/60 text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      <span className="text-text-muted" aria-hidden="true">{icon}</span>
      <p className="text-[15px] font-semibold text-text-primary">{title}</p>
      {body ? <div className="max-w-[420px] text-[14px] text-text-secondary">{body}</div> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: { title: string; body?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return <StateShell icon={<Inbox size={28} />} {...props} />;
}

export function ErrorState({
  title = "Couldn't load this",
  body,
  onRetry,
  className,
  compact,
}: {
  title?: string;
  body?: ReactNode;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <StateShell
      icon={<CloudOff size={28} />}
      title={title}
      body={body ?? (onRetry ? "Check your connection and try again." : undefined)}
      className={className}
      compact={compact}
      action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button> : undefined}
    />
  );
}

/**
 * The backend capability behind this section is not connected yet. This is a
 * distinct, honest state - never dressed up as empty data or a success.
 */
export function PendingState({
  title = "Not connected yet",
  body,
  capability,
  className,
  compact,
}: {
  title?: string;
  body?: ReactNode;
  capability?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <StateShell
      icon={<PlugZap size={28} />}
      title={title}
      compact={compact}
      className={className}
      body={
        <>
          <p>{body ?? "Live data for this section will appear here once it's connected."}</p>
          {capability ? <p className="num mt-2 text-[11px] text-text-muted">{capability}</p> : null}
        </>
      }
    />
  );
}

export function InlineNotice({ tone = "warning", children, className }: { tone?: "warning" | "info" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    warning: "border-warning/30 bg-warning-soft text-warning",
    info: "border-accent-line bg-accent-soft text-[#cdbbff]",
    danger: "border-danger/30 bg-danger-soft text-danger",
  } as const;
  return (
    <div role="status" className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-5", tones[tone], className)}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface ResourceViewProps<T> {
  state: ResourceState<T>;
  /** Skeleton with the same geometry as the loaded content. */
  loading: ReactNode;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  onRetry?: () => void;
  errorTitle?: string;
  pendingTitle?: string;
  compact?: boolean;
  className?: string;
}

/** Renders a `useResource` state so each section handles all four outcomes the same way. */
export function ResourceView<T>({
  state,
  loading,
  children,
  isEmpty,
  empty,
  onRetry,
  errorTitle,
  pendingTitle,
  compact,
  className,
}: ResourceViewProps<T>) {
  if (state.status === "loading" && state.data === null) return <>{loading}</>;
  if (state.status === "pending") {
    return (
      <PendingState
        title={pendingTitle}
        body={state.error.message}
        capability={state.error.capability}
        compact={compact}
        className={className}
      />
    );
  }
  if (state.status === "error") {
    // A message that just repeats the title adds nothing.
    const same = errorTitle && state.error.message.replace(/[.!\s]+$/, "").toLowerCase() === errorTitle.replace(/[.!\s]+$/, "").toLowerCase();
    return <ErrorState title={errorTitle} body={same ? undefined : state.error.message} onRetry={state.error.retryable ? onRetry : undefined} compact={compact} className={className} />;
  }
  const data = state.data as T;
  if (isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
