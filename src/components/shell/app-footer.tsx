import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="mt-24 border-t border-line px-6 py-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint md:flex-row md:justify-between">
        <span>KOVA / LIQUIDITY WITH EVIDENCE</span>
        <span>SIGNING DISABLED · YOUR WALLET IS THE AUTHORITY</span>
        <Link href="/legal/risk" className="transition-colors hover:text-accent">
          RISK DISCLOSURE
        </Link>
      </div>
    </footer>
  );
}
