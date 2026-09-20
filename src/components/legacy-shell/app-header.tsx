import Link from "next/link";
import { KovaLogo } from "@/app/float-logo";
import { AppNav } from "./app-nav";
import { SessionMenu } from "@/components/auth/session-menu";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-6 py-3">
        <Link href="/app" className="shrink-0">
          <KovaLogo />
        </Link>
        <div className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1">
          <AppNav />
        </div>
        <div className="order-2 ml-auto flex items-center gap-3 lg:order-3">
          <span className="hidden items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-muted md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
            READ ONLY
          </span>
          <SessionMenu />
        </div>
      </div>
    </header>
  );
}
