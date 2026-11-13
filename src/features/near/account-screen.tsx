"use client";

/**
 * /account: who you are signed in as, your CHIP, the game key, any blind owed, your clan, and sign
 * out. Signed out, it is the sign-in page.
 */
import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatChip } from "@/adapters/near/chip";
import { displayAccount } from "@/adapters/near/leaderboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { clanPath } from "./clans";
import { GAME_KEY_ALLOWANCE, nearNetwork } from "./near-session";
import { NEAR_CLANS_PATH, NEAR_PLAY_PATH, NEAR_TABLES_PATH } from "./paths";
import { ReadyGate } from "./ready-gate";
import { usePlayer } from "./use-player";
import { usePoll } from "./use-poll";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <dt className="text-[13px] text-text-secondary">{label}</dt>
      <dd className="text-right text-[14px] text-text-primary">{children}</dd>
    </div>
  );
}

export function AccountScreen() {
  const player = usePlayer();
  const { near, accountId } = player;
  const clan = usePoll(accountId ? () => near.chip.getAccountClan(accountId) : null, 30_000, `account-clan:${accountId}`);
  const allowanceNear = Number(BigInt(GAME_KEY_ALLOWANCE) / 10n ** 21n) / 1000;

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <header>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">{accountId ? "Your account" : "Sign in"}</h1>
        <p className="mt-2 text-[16px] text-text-secondary">
          {accountId ? "Your CHIP and your game key, read from the contract on NEAR testnet." : "Kova runs on NEAR testnet. CHIP is a testnet token with no value."}
        </p>
      </header>

      <ReadyGate />

      {accountId ? (
        <>
          <Card className="p-5" as="section" aria-label="Account">
            <dl className="divide-y divide-border-subtle">
              <Line label="Account">
                <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={nearNetwork.explorerAccount(accountId)} target="_blank" rel="noreferrer">
                  {displayAccount(accountId)} <ExternalLink size={12} aria-hidden="true" />
                </a>
              </Line>
              <Line label="Signed in with">{near.method === "email" ? `Email${near.email ? ` (${near.email})` : ""}, wallet kept by Privy` : "Your NEAR wallet"}</Line>
              <Line label="CHIP">
                <span className="num font-semibold">{player.balance !== null ? formatChip(player.balance) : "…"}</span>
              </Line>
              <Line label="Game key">
                {player.keyActive ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
                <span className="ml-2 text-[12px] text-text-muted">game methods only, up to {allowanceNear} NEAR of gas</span>
              </Line>
              <Line label="Clan">
                {clan.data ? (
                  <Link className="underline-offset-2 hover:underline" href={clanPath(clan.data)}>
                    {clan.data}
                  </Link>
                ) : (
                  <Link className="text-[#b79bff] hover:text-[#d0bdff]" href={NEAR_CLANS_PATH}>
                    Found or join one
                  </Link>
                )}
              </Line>
            </dl>
            {player.pendingBlind > 0n ? (
              <InlineNotice tone="warning" className="mt-3">
                You owe a {formatChip(player.pendingBlind)} CHIP blind for sitting out. It is collected on your next move. Play a table to reset the clock.
              </InlineNotice>
            ) : null}
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button href={NEAR_PLAY_PATH} iconRight={<ArrowRight size={16} />}>
              Play a round
            </Button>
            <Button href={NEAR_TABLES_PATH} variant="secondary">
              Your tables
            </Button>
            <Button variant="ghost" onClick={() => void near.disconnect()}>
              Sign out
            </Button>
          </div>
          <p className="text-[12px] leading-5 text-text-muted">
            The game key lives only in this browser. On another device, sign in and turn it on again; your CHIP is on chain and comes with you.
          </p>
        </>
      ) : null}
    </div>
  );
}
