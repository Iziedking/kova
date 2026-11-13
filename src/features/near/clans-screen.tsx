"use client";

/** /clans: today's clan race, and founding or joining a clan. Each clan has its own page, /c/<name>. */
import { ClanCard } from "./clan-card";
import { ReadyGate } from "./ready-gate";

export function ClansScreen() {
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <header>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Clans</h1>
        <p className="mt-2 text-[16px] text-text-secondary">
          Every settled table counts for each clan seated at it. If the day meets its target, the leading clan&apos;s players claim a double share of the daily mint.
        </p>
      </header>
      <ReadyGate purpose="found or join a clan" />
      <ClanCard />
    </div>
  );
}
