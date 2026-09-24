import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const WIDTH = {
  /** Standard pages: 1440px max. */
  app: "max-w-[var(--container-app)]",
  /** The trading match may use the full 1600px. */
  wide: "max-w-[var(--container-trading)]",
  /** Reading and form pages. */
  narrow: "max-w-[760px]",
} as const;

/**
 * The responsive page frame: 16px gutters on mobile, 24px on laptop, 32px on
 * large desktop; 28-36px top padding on desktop; clears the mobile bottom nav.
 */
export function PageContainer({
  children,
  width = "app",
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
  as?: "div" | "main" | "section";
}) {
  return (
    <Tag className={cn("mx-auto w-full px-4 pt-5 md:px-6 md:pt-8 xl:px-8", WIDTH[width], className)}>{children}</Tag>
  );
}
