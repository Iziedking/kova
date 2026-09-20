import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "light" | "success" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  // Violet is brand + action. The gradient is the one place it is allowed to be a gradient.
  primary:
    "bg-linear-to-b from-[#b092ff] to-[#8f63f4] text-accent-ink hover:from-[#bea3ff] hover:to-[#9b72fa] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
  secondary: "bg-surface-2 text-text-primary border border-border-strong hover:bg-surface-3 hover:border-[#454858]",
  outline: "border border-border-strong text-text-primary hover:bg-surface-2",
  ghost: "text-text-secondary hover:text-text-primary hover:bg-surface-2",
  light: "bg-[#f4f2f7] text-[#0d0e13] hover:bg-white",
  success: "bg-success text-[#04140d] hover:brightness-110",
  danger: "bg-danger text-[#1a0308] hover:brightness-110",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-[14px] gap-2",
  lg: "h-[50px] px-6 text-[15px] gap-2.5",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  /** Replaces the label while `loading`, e.g. `Creating…`. Keeps an accessible name. */
  loadingLabel?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  children?: ReactNode;
}

type AsButton = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { href?: undefined };
type AsLink = CommonProps & { href: string; disabled?: boolean; prefetch?: boolean; "aria-label"?: string; onClick?: () => void };

export type ButtonProps = AsButton | AsLink;

export function buttonClasses({
  variant = "primary",
  size = "md",
  block,
  className,
}: Pick<CommonProps, "variant" | "size" | "block" | "className">): string {
  // A bare `hidden` (e.g. `hidden xl:inline-flex`) must not fight the base `inline-flex`.
  const startsHidden = /(^|\s)hidden(\s|$)/.test(className ?? "");
  return cn(
    !startsHidden && "inline-flex",
    "select-none items-center justify-center whitespace-nowrap rounded-button font-semibold",
    "transition-[background-color,border-color,color,filter,transform] duration-[160ms] ease-out active:scale-[0.99]",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );
}

export function Button(props: ButtonProps) {
  const { variant, size, block, loading, loadingLabel, iconLeft, iconRight, className, children } = props;
  const classes = buttonClasses({ variant, size, block, className });
  const content = (
    <>
      {iconLeft ? <span className="shrink-0" aria-hidden="true">{iconLeft}</span> : null}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
      {iconRight && !loading ? <span className="shrink-0" aria-hidden="true">{iconRight}</span> : null}
    </>
  );

  if (props.href !== undefined) {
    const { href, disabled, prefetch, onClick } = props;
    return (
      <Link
        href={href}
        prefetch={prefetch}
        onClick={onClick}
        aria-disabled={disabled || undefined}
        aria-label={props["aria-label"]}
        tabIndex={disabled ? -1 : undefined}
        className={classes}
      >
        {content}
      </Link>
    );
  }

  const {
    variant: _variant,
    size: _size,
    block: _block,
    loading: _loading,
    loadingLabel: _loadingLabel,
    iconLeft: _iconLeft,
    iconRight: _iconRight,
    className: _className,
    children: _children,
    disabled,
    type = "button",
    ...rest
  } = props;
  void [_variant, _size, _block, _loading, _loadingLabel, _iconLeft, _iconRight, _className, _children];
  return (
    <button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes}>
      {content}
    </button>
  );
}
