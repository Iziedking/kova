import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { KovaLogo } from "@/app/float-logo";
import { LatticeCanvas } from "@/components/background/lattice-canvas";
import { KovaPrivyProvider } from "@/components/auth/privy-client-provider";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import { privyAppId } from "@/auth/privy-env";

export const metadata: Metadata = {
  title: "Sign in: KOVA",
  description: "Sign in to KOVA with an email address or a wallet.",
};

export default function LoginPage() {
  const appId = privyAppId();

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line lg:block">
        <LatticeCanvas />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <Link href="/">
            <KovaLogo />
          </Link>
          <div className="max-w-sm">
            <p className="mb-4 font-display text-2xl font-bold leading-snug text-ink">
              Explore markets without an account.
            </p>
            <p className="leading-relaxed text-muted">
              Sign in when you want to back one. Your wallet stays the only authority over your
              capital.
            </p>
          </div>
          <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
            SOLANA MAINNET · CAPTURED PREVIEW · SIGNING DISABLED
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-6 py-16">
        <div className="mb-10 w-full max-w-md lg:hidden">
          <Link href="/" className="inline-block">
            <KovaLogo />
          </Link>
        </div>

        {appId ? (
          <KovaPrivyProvider appId={appId}>
            <Suspense fallback={<p className="font-mono text-xs text-muted">LOADING SIGN IN</p>}>
              <SignInPanel />
            </Suspense>
          </KovaPrivyProvider>
        ) : (
          <div className="w-full max-w-md">
            <span className="mb-3 block font-mono text-[11px] tracking-[0.18em] text-warn">
              {"/// SIGN IN UNAVAILABLE"}
            </span>
            <h1 className="mb-4 font-display text-3xl font-bold text-ink">Sign in is not configured.</h1>
            <p className="mb-8 leading-relaxed text-muted">
              This deployment has no Privy application configured, so sign in cannot be offered.
              Market review does not require an account.
            </p>
            <Link
              href="/markets"
              className="inline-flex min-h-11 items-center border border-line-strong px-6 font-mono text-xs tracking-[0.12em] text-ink transition-colors hover:bg-elevated"
            >
              BROWSE MARKETS
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
