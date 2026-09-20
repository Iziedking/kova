"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { DESKTOP_NAV, isActive } from "./nav-items";

/** Home / Play / Markets / Leaderboard. The active item carries a bar on the header's lower edge. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden h-full items-stretch gap-1 lg:flex">
      {DESKTOP_NAV.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center px-4 text-[15px] font-medium transition-colors duration-[120ms]",
              active ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
            {active ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-accent" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
