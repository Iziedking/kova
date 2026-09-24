"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * One accessible overlay primitive (focus trap, Escape, scroll lock, aria) with
 * three presentations: a centred Dialog, a BottomSheet and a side Drawer.
 * `ResponsiveOverlay` picks Dialog on desktop and BottomSheet on mobile, which is
 * how Create Table, Challenge and Trade Review are meant to behave.
 */
interface OverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visually hidden when false; still required for assistive tech. */
  showTitle?: boolean;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Block dismissal while an action is in flight. */
  dismissible?: boolean;
}

function Backdrop() {
  return <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] animate-fade-in" />;
}

function CloseButton({ disabled }: { disabled?: boolean }) {
  return (
    <RadixDialog.Close
      disabled={disabled}
      aria-label="Close"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
    >
      <X size={18} aria-hidden="true" />
    </RadixDialog.Close>
  );
}

function Header({ title, showTitle = true, description, disabled }: Pick<OverlayProps, "title" | "showTitle" | "description"> & { disabled?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-4", showTitle ? "px-5 pb-1 pt-5" : "absolute right-3 top-3 z-10")}>
      {showTitle ? (
        <div className="min-w-0">
          <RadixDialog.Title className="font-display text-[20px] font-bold leading-tight text-text-primary">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-[14px] text-text-secondary">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
        </div>
      ) : (
        <>
          <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">{description ?? title}</RadixDialog.Description>
        </>
      )}
      <CloseButton disabled={disabled} />
    </div>
  );
}

function guard(dismissible: boolean) {
  return dismissible
    ? {}
    : {
        onEscapeKeyDown: (event: KeyboardEvent) => event.preventDefault(),
        onPointerDownOutside: (event: Event) => event.preventDefault(),
        onInteractOutside: (event: Event) => event.preventDefault(),
      };
}

export function Dialog({ open, onOpenChange, title, showTitle, description, children, footer, className, dismissible = true }: OverlayProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Backdrop />
        <RadixDialog.Content
          {...guard(dismissible)}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,760px)] w-[calc(100vw-32px)] max-w-[600px] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-sheet border border-border-strong bg-surface-1 shadow-modal animate-rise-in outline-none",
            className,
          )}
        >
          <Header title={title} showTitle={showTitle} description={description} disabled={!dismissible} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-border-subtle px-5 py-4">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function BottomSheet({ open, onOpenChange, title, showTitle, description, children, footer, className, dismissible = true }: OverlayProps) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);

  function onDown(event: PointerEvent<HTMLDivElement>) {
    if (!dismissible) return;
    start.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return;
    setDragY(Math.max(0, event.clientY - start.current));
  }
  function onUp() {
    if (start.current === null) return;
    const shouldClose = dragY > 110;
    start.current = null;
    setDragging(false);
    setDragY(0);
    if (shouldClose) onOpenChange(false);
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Backdrop />
        <RadixDialog.Content
          {...guard(dismissible)}
          style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging ? "none" : "transform 200ms" }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-sheet border border-b-0 border-border-strong bg-surface-1 shadow-modal outline-none animate-sheet-up",
            className,
          )}
        >
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
            aria-hidden="true"
          >
            <span className="h-1 w-10 rounded-full bg-border-strong" />
          </div>
          <Header title={title} showTitle={showTitle} description={description} disabled={!dismissible} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-border-subtle px-5 pb-safe pt-4">{footer}<div className="h-4" /></div> : <div className="pb-safe" />}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Drawer({ open, onOpenChange, title, showTitle, description, children, footer, className, dismissible = true }: OverlayProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Backdrop />
        <RadixDialog.Content
          {...guard(dismissible)}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border-strong bg-surface-1 shadow-modal outline-none animate-sheet-right",
            className,
          )}
        >
          <Header title={title} showTitle={showTitle} description={description} disabled={!dismissible} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-border-subtle px-5 py-4">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Dialog from 768px up; BottomSheet below. */
export function ResponsiveOverlay(props: OverlayProps) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return desktop ? <Dialog {...props} /> : <BottomSheet {...props} />;
}
