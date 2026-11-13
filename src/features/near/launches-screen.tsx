"use client";

/**
 * /launches: what is cooking on meme.cooking, and the "Will it cook?" calls that are open now. A call
 * goes to the play page with that pick already chosen.
 */
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { callMarket, callSymbol } from "@/adapters/near/launch-calls";
import { formatNear } from "@/adapters/near/meme-cooking";
import { Card } from "@/components/ui/section";
import { LaunchLobby } from "./launch-lobby";
import { timeLeft } from "./launches";
import { usePickOptions } from "./market-picker";
import { playWithPick } from "./paths";

export function LaunchesScreen() {
  const { callable, now } = usePickOptions();
  return (
    <div className="mx-auto w-full max-w-[var(--container-app)] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <header className="max-w-[720px]">
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Launches</h1>
        <p className="mt-2 text-[16px] text-text-secondary">
          Play the launches while they cook. When a meme.cooking auction has 14 minutes left, call whether it reaches its launch line; the round runs until it ends and meme.cooking&apos;s contract decides.
        </p>
      </header>

      <Card className="p-5" as="section" aria-label="Will it cook? Calls open now">
        <h2 className="font-display text-[18px] font-bold text-text-primary">Will it cook? Calls open now</h2>
        {callable.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {callable.flatMap((a) =>
              (["cooks", "flops"] as const).map((side) => (
                <li key={`${a.id}-${side}`}>
                  <Link href={playWithPick(callMarket(a.id, callSymbol(a.symbol), side))} className="group flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-2 px-4 py-3 hover:border-accent">
                    <span>
                      <span className="block text-[15px] font-semibold text-text-primary">
                        {a.symbol} {side === "cooks" ? "cooks" : "does not cook"}
                      </span>
                      <span className="num block text-[12px] text-text-muted">
                        {formatNear(BigInt(a.raised))} of {formatNear(BigInt(a.softCap), 0)} NEAR · {timeLeft(a.endsAt, now)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#b79bff]">
                      Call it <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              )),
            )}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-text-muted">No auction ends within 14 minutes right now. Each one below says when its calls open.</p>
        )}
      </Card>

      <LaunchLobby />
    </div>
  );
}
