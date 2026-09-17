"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

/** Only same-origin absolute paths are honoured, so `?next=` cannot become an open redirect. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/app";
  return raw;
}

export function SignInPanel() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (ready && authenticated) router.replace(next);
  }, [ready, authenticated, next, router]);

  return (
    <div className="w-full max-w-md">
      <span className="mb-3 block font-mono text-[11px] tracking-[0.18em] text-accent">{"/// SIGN IN"}</span>
      <h1 className="mb-4 font-display text-3xl font-bold text-ink md:text-4xl">Continue to KOVA</h1>
      <p className="mb-8 leading-relaxed text-muted">
        Use an email address or a wallet. Either one signs you in; neither grants KOVA any authority
        over your funds.
      </p>

      <button
        type="button"
        onClick={() => login()}
        disabled={!ready}
        className="mb-4 flex min-h-11 w-full items-center justify-center bg-accent px-6 py-4 font-mono text-xs font-bold tracking-[0.12em] text-accent-ink transition-colors hover:bg-accent-hi disabled:cursor-wait disabled:opacity-60"
      >
        {ready ? "CONTINUE WITH EMAIL OR WALLET" : "LOADING SIGN IN"}
      </button>

      <p className="mb-8 text-xs leading-relaxed text-muted">
        Signing in creates no wallet, prepares no transaction, requests no signature and moves no
        funds. Delegated signing and automated rebalancing are disabled in this build.
      </p>

      <div className="border-t border-line pt-6">
        <p className="text-xs leading-relaxed text-muted">
          You do not need an account to review a market.{" "}
          <Link href="/markets" className="text-accent underline">
            Browse markets first
          </Link>
        </p>
      </div>
    </div>
  );
}
