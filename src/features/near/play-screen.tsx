"use client";

/**
 * /play: start a round, and nothing else. Who you play, your pick, the stake and the round, then go.
 * Getting set up sits above it as one card with the next step only (ReadyGate). Once a table opens,
 * the player moves to that table's own page (/t/<id>), where the round runs.
 */
import { ArrowRight, Swords, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CHIP, formatChip } from "@/adapters/near/chip";
import { callRoundSeconds, parseCall } from "@/adapters/near/launch-calls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { MarketPicker, Pills, usePickOptions } from "./market-picker";
import { NEAR_LAUNCHES_PATH, NEAR_TABLES_PATH, tablePath } from "./paths";
import { ReadyGate } from "./ready-gate";
import { openFriendTable, playTheHouse, type SeatOutcome, usePendingPickRecovery } from "./seat-actions";
import { usePlayer } from "./use-player";
import { usePoll } from "./use-poll";

const STAKES = [10, 25, 50, 100] as const;
const SEAT_CHOICES = [2, 3, 4, 6] as const;
const ROUNDS = [60, 90, 300] as const;
const roundLabel = (s: number) => (s === 300 ? "5 min" : `${s} s`);

export function PlayScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const player = usePlayer();
  const { near, accountId } = player;
  const { markets, callable, now } = usePickOptions();
  const house = usePoll(async () => (await (await fetch("/api/near/house")).json()) as { balance: string }, 30_000, "house");
  const tables = usePoll(() => near.chip.getTables(undefined, 20), 15_000, "tables");
  usePendingPickRecovery(accountId, tables.data ?? null);

  const [opponent, setOpponent] = useState<"house" | "friends">("house");
  const [market, setMarket] = useState<string | null>(params.get("pick"));
  const [stake, setStake] = useState<(typeof STAKES)[number]>(25);
  const [round, setRound] = useState<(typeof ROUNDS)[number]>(60);
  const [seats, setSeats] = useState<(typeof SEAT_CHOICES)[number]>(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<SeatOutcome | null>(null);

  // A call is valid only while its auction is still callable; otherwise fall back to the first live coin.
  const pickedCall = parseCall(market);
  const callAuction = pickedCall ? (callable.find((a) => a.id === pickedCall.memeId) ?? null) : null;
  const chosen = pickedCall && !callAuction ? null : (market ?? markets.data?.find((m) => m.available)?.id ?? null);
  const chosenMarket = markets.data?.find((m) => m.id === chosen) ?? null;
  const callRound = callAuction ? callRoundSeconds(callAuction.endsAt, now * 1000) : null;
  const quiet = chosenMarket?.available && round <= 90 && !chosenMarket.trades5m ? chosenMarket : null;

  const ready = player.step === "ready";
  const enough = player.balance !== null && player.balance >= BigInt(stake) * CHIP;
  const houseShort = opponent === "house" && house.data && BigInt(house.data.balance) < BigInt(stake) * CHIP;
  const waiting = (tables.data ?? []).filter((t) => t.status === "Open" && t.open_until > now && !t.players.some((p) => p.player === accountId)).length;

  async function start() {
    if (!accountId || !chosen) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome =
        opponent === "house"
          ? await playTheHouse(near, accountId, { market: chosen, stake, roundSeconds: round, callMemeId: callAuction?.id })
          : await openFriendTable(near, accountId, { market: chosen, stake, seats, roundSeconds: round, callEndsAt: callAuction?.endsAt });
      if (outcome.tableId) {
        const query = outcome.text ? `?note=${encodeURIComponent(outcome.text)}` : opponent === "friends" ? "?share=1" : "";
        router.push(`${tablePath(outcome.tableId)}${query}`);
        return;
      }
      setMessage(outcome);
    } finally {
      setBusy(false);
      void player.refresh();
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <header>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Play a round</h1>
        <p className="mt-2 text-[16px] text-text-secondary">Pick the coin you think rises most, or call a meme.cooking launch. The best move takes the pot, and 10% of it burns.</p>
      </header>

      <ReadyGate />

      <Card className="space-y-6 p-5 md:p-6" as="section" aria-label="New round">
        <fieldset disabled={!ready || busy} className="space-y-6">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Play against</p>
            <div role="radiogroup" aria-label="Play against" className="inline-flex gap-1 rounded-xl border border-border-subtle bg-surface-2 p-1">
              {(
                [
                  ["house", "The House"],
                  ["friends", "Friends, by link"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={opponent === value}
                  onClick={() => setOpponent(value)}
                  className={cn("h-10 rounded-lg px-4 text-[14px] font-semibold transition-colors", opponent === value ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:text-text-primary")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-medium text-text-secondary">Your pick</p>
            <MarketPicker value={chosen} onChange={setMarket} markets={markets.data ?? null} callable={callable} now={now} />
            {quiet ? (
              <p className="mt-2 text-[12px] text-warning" role="status">
                {quiet.symbol} has not traded in the last 5 minutes. In a {round} s round it will most likely score 0.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-5">
            <Pills label="Stake (CHIP)" options={STAKES} value={stake} onChange={setStake} />
            {callAuction ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Round</p>
                <p className="num flex h-11 items-center text-[13px] text-text-secondary">Until {callAuction.symbol} ends: {callRound !== null ? `${Math.ceil(callRound / 60)} min` : "closed"}</p>
              </div>
            ) : (
              <Pills label="Round" options={ROUNDS} value={round} onChange={setRound} format={roundLabel} />
            )}
            {opponent === "friends" ? <Pills label="Seats, you included" options={SEAT_CHOICES} value={seats} onChange={setSeats} /> : null}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Button
            size="lg"
            iconLeft={opponent === "house" ? <Swords size={18} /> : <Users size={18} />}
            disabled={!ready || !chosen || !enough || !!houseShort || busy}
            loading={busy}
            loadingLabel={opponent === "house" ? "Opening the table…" : "Opening your table…"}
            onClick={() => void start()}
          >
            {opponent === "house" ? `Play the House for ${stake} CHIP` : seats === 2 ? `Challenge a friend for ${stake} CHIP` : `Open a ${seats}-seat table for ${stake} CHIP`}
          </Button>
          <p className="text-[12px] leading-5 text-text-muted">
            {opponent === "house"
              ? "The House takes the other seat at once and picks its own coin. You go straight to the table."
              : `You take the first seat and get a link to send. Seats stay open ${callAuction ? "until shortly before the auction ends" : "for 10 minutes"}; if nobody joins, every stake comes back.`}
          </p>
          {ready && player.balance !== null && !enough ? <p className="text-[12px] text-warning">You have {formatChip(player.balance)} CHIP, less than this stake.</p> : null}
          {houseShort ? <p className="text-[12px] text-warning">The House has {formatChip(BigInt(house.data!.balance))} CHIP and sits out at this stake.</p> : null}
          {message?.text ? (
            <InlineNotice tone={message.tone}>
              {message.text}{" "}
              {message.link ? (
                <a className="underline" href={message.link} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              ) : null}
            </InlineNotice>
          ) : null}
        </div>
      </Card>

      <nav aria-label="More ways to play" className="grid gap-3 sm:grid-cols-2">
        <Link href={NEAR_TABLES_PATH} className="group flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-1 px-4 py-3 hover:border-border-strong">
          <span>
            <span className="block text-[14px] font-semibold text-text-primary">Join a table</span>
            <span className="block text-[12px] text-text-muted">{waiting ? `${waiting} waiting for a player` : "Your tables and recent results"}</span>
          </span>
          <ArrowRight size={16} className="text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
        <Link href={NEAR_LAUNCHES_PATH} className="group flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-1 px-4 py-3 hover:border-border-strong">
          <span>
            <span className="block text-[14px] font-semibold text-text-primary">Call a launch</span>
            <span className="block text-[12px] text-text-muted">{callable.length ? `${callable.length} meme.cooking call${callable.length === 1 ? "" : "s"} open now` : "What is cooking on meme.cooking"}</span>
          </span>
          <ArrowRight size={16} className="text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </nav>
    </div>
  );
}
