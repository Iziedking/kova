"use client";

import { useState } from "react";
import Link from "next/link";
import { KovaLogo } from "@/app/float-logo";

const LINKS = [
  { label: "THE PROBLEM", href: "#problem" },
  { label: "BOUNDARIES", href: "#boundaries" },
  { label: "THE LOOP", href: "#loop" },
  { label: "EVIDENCE", href: "#evidence" },
];

/**
 * `LAUNCH APP` points at /markets for now. The auth plan repoints it to /login
 * once that route exists; it must never point at a route that does not.
 */
export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 z-50 w-full border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="z-50 flex items-center gap-3">
            <KovaLogo />
          </Link>

          <div className="hidden gap-8 font-mono text-[11px] tracking-[0.12em] text-muted md:flex">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <span className="flex items-center gap-2 font-mono text-[10px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
              READ ONLY
            </span>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center border border-line-strong px-6 font-mono text-[11px] tracking-[0.12em] text-ink transition-colors hover:bg-ink hover:text-bg"
            >
              LAUNCH APP
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="z-50 -mr-2 min-h-11 min-w-11 font-mono text-[11px] tracking-[0.12em] text-ink md:hidden"
          >
            {open ? "CLOSE" : "MENU"}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-bg/95 backdrop-blur-xl md:hidden">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="font-display text-2xl font-bold text-ink"
            >
              {link.label}
            </a>
          ))}
          <span className="my-2 h-px w-12 bg-line" aria-hidden="true" />
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="font-mono text-sm tracking-[0.12em] text-accent"
          >
            LAUNCH APP
          </Link>
        </div>
      ) : null}
    </>
  );
}
