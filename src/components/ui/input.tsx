import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  hint?: string;
  /** Rendered directly beneath the field, in the danger colour. */
  error?: string | null;
  iconLeft?: ReactNode;
  suffix?: ReactNode;
  size?: "md" | "lg";
  /** Hide the visible label while keeping it for assistive tech. */
  hideLabel?: boolean;
  wrapperClassName?: string;
}

export function Input({
  label,
  hint,
  error,
  iconLeft,
  suffix,
  size = "md",
  hideLabel,
  className,
  wrapperClassName,
  id,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn("w-full", wrapperClassName)}>
      {label ? (
        <label htmlFor={inputId} className={cn("mb-2 block text-[13px] font-semibold text-text-primary", hideLabel && "sr-only")}>
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-input border bg-surface-1 px-3.5 transition-colors duration-[160ms]",
          "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
          size === "lg" ? "h-[50px]" : "h-11",
          error ? "border-danger/70" : "border-border-strong hover:border-[#454858]",
        )}
      >
        {iconLeft ? <span className="shrink-0 text-text-muted" aria-hidden="true">{iconLeft}</span> : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-muted",
            className,
          )}
          {...rest}
        />
        {suffix ? <span className="shrink-0 text-[13px] text-text-secondary">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[13px] text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
