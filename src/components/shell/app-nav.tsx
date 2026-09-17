"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The six destinations from spec section 3.2. Routes not yet built are marked
 * and inert rather than linking to a 404.
 */
const ITEMS = [
  { href: "/app", label: "HOME", ready: true },
  { href: "/markets", label: "MARKETS", ready: true },
  { href: "/app/campaigns", label: "CAMPAIGNS", ready: false },
  { href: "/app/positions", label: "POSITIONS", ready: false },
  { href: "/app/autopilot", label: "AUTOPILOT", ready: false },
  { href: "/app/workspace", label: "WORKSPACE", ready: false },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        if (!item.ready) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Not built yet"
              className="inline-flex min-h-11 shrink-0 items-center px-4 font-mono text-[11px] tracking-[0.12em] text-faint"
            >
              {item.label}
            </span>
          );
        }

        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 font-mono text-[11px] tracking-[0.12em] transition-colors ${
              active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
