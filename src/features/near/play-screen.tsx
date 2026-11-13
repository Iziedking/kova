"use client";

import { ArrowUpRight, Coins, KeyRound, Swords, Timer, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CHIP, type ChipTable, failureMessage, formatChip, newSalt, openedTableId, pickCommitment } from "@/adapters/near/chip";
import { displayAccount } from "@/adapters/near/leaderboard";
import { callMarket, callOpenSeconds, callRoundSeconds, callSymbol, parseCall } from "@/adapters/near/launch-calls";
import { formatNear, type LaunchLobbyJson, memeUrl } from "@/adapters/near/meme-cooking";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { ClanCard } from "./clan-card";
import { DailyClaim } from "./daily-claim";
import { LaunchLobby } from "./launch-lobby";
import { timeLeft } from "./launches";
import { NearLeaderboard } from "./near-leaderboard";
import { copyText, inviteUrl } from "./share-table";
import { HOUSE_ACCOUNT, nearNetwork, useNear } from "./near-session";
import { SupplyCounter } from "./supply-counter";
import { TableView } from "./table-view";
import { useLocalValue } from "./use-local-value";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";
import { currentStore, deliverPick, pickStore } from "./picks";

type Market = {
  id: string;
  symbol: string;
  name: string;
  group: "busy" | "launch" | "meme";
  memeCookingId?: number;
  available: boolean;
  priceUsd?: string;
  liquidityUsd?: number;
  change1hPct?: number | null;
  trades5m?: number;
  trades1h?: number;
  reason?: string;
};

const MARKET_GROUPS = [
  { group: "busy", title: "Trades every minute", hint: "Busy NEAR pools. Best for 60 s and 90 s rounds." },
  {
    group: "launch",
    title: "Launched on meme.cooking",
    hint: "meme.cooking launches with a pool still above $10,000. They trade a few times an hour, so pick a 5 min round; a coin with no trades scores 0.",
  },
  { group: "meme", title: "NEAR memecoins", hint: "Thin pools that trade a few times an hour. A coin with no trades scores 0, so short rounds often tie." },
] as const;

function marketActivity(m: Market): string {
  if (!m.available) return "unavailable";
  const move = m.change1hPct !== null && m.change1hPct !== undefined ? `${m.change1hPct > 0 ? "+" : ""}${m.change1hPct}% 1h · ` : "";
  const trades = m.trades5m ? `${m.trades5m} trades in 5 min` : m.trades1h ? `${m.trades1h} trades in 1h` : "no trades in 1h";
  return `${move}${trades}`;
}

/** The lobby's cooking auctions, for "Will it cook?" calls. A failed read just means no calls are offered. */
async function readLaunches(): Promise<LaunchLobbyJson> {
  const response = await fetch("/api/near/launches");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as LaunchLobbyJson;
}

const STAKES = [10, 25, 50, 100] as const;
const SEAT_CHOICES = [2, 3, 4, 6] as const;

function clock(seconds: number) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** A friend table stays open for the contract's longest window, so a link has time to travel. */
const FRIEND_OPEN_SECONDS = 600;
/** Where a host's pick waits while open_table is in flight, before the table has an id. */
const PENDING_TABLE = "pending-open";
const ROUNDS = [
  { seconds: 60, label: "60 s" },
  { seconds: 90, label: "90 s" },
  { seconds: 300, label: "5 min" },
] as const;

function Step({ index, title, done, children }: { index: number; title: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("flex gap-3", done && "opacity-60")}>
      <span className={cn("num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold", done ? "border-success/40 text-success" : "border-border-strong text-text-secondary")}>{index}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </div>
  );
}

export function PlayScreen({ invite = null }: { invite?: string | null }) {
  const near = useNear();
  const { chip, accountId } = near;
  const stats = usePoll(() => chip.getStats(), 6_000, "stats");
  const holder = usePoll(accountId ? () => chip.getHolder(accountId) : null, 6_000, `holder:${accountId}`);
  const tables = usePoll(() => chip.getTables(undefined, 20), 5_000, "tables");
  const markets = usePoll(async () => ((await (await fetch("/api/near/markets")).json()) as { markets: Market[] }).markets, 60_000, "markets");
  const house = usePoll(async () => (await (await fetch("/api/near/house")).json()) as { balance: string; openTables: number; maxOpenTables: number }, 15_000, "house");

  const [stake, setStake] = useState<(typeof STAKES)[number]>(25);
  const [round, setRound] = useState<number>(60);
  const [market, setMarket] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "danger" | "info" | "warning"; text: string; link?: string } | null>(null);
  const [current, setCurrent] = useLocalValue(accountId ? currentStore(accountId) : null);
  const [mode, setMode] = useState<"house" | "friends">("house");
  const [seats, setSeats] = useState<(typeof SEAT_CHOICES)[number]>(4);
  const invited = usePoll(invite ? () => chip.getTable(invite) : null, 4_000, `invite:${invite}`);

  const now = useNow();
  const launches = usePoll(readLaunches, 60_000, "play-launches");
  // Auctions a call can be made on now: ending within the longest round, with time to start it.
  const callable = useMemo(() => {
    const window = invited.data && invited.data.status === "Open" ? invited.data.round_seconds : null;
    return (launches.data?.cooking ?? []).filter((a) => {
      if (callRoundSeconds(a.endsAt, now * 1000) === null) return false;
      // Joining a host's table: its round is fixed, so the auction must end before it would.
      return window === null || a.endsAt <= (now + window) * 1000;
    });
  }, [launches.data, now, invited.data]);

  // The first available market (a busy one when any is up) is the default until the player chooses one.
  const pickedCall = parseCall(market);
  const callAuction = pickedCall ? (callable.find((a) => a.id === pickedCall.memeId) ?? null) : null;
  // A call whose window closed is no longer a valid pick.
  const chosen = pickedCall && !callAuction ? null : (market ?? markets.data?.find((m) => m.available)?.id ?? null);
  const callRound = callAuction ? callRoundSeconds(callAuction.endsAt, now * 1000) : null;
  const chosenMarket = markets.data?.find((m) => m.id === chosen) ?? null;
  const quietPick = chosenMarket?.available && round <= 90 && !chosenMarket.trades5m ? chosenMarket : null;

  const balance = holder.data?.balance ?? null;
  const hasChips = balance !== null && balance > 0n;
  const starterClaimed = holder.data?.starter_claimed ?? false;
  const keyActive = near.keyState === "active";

  const openTables = useMemo(
    () => (tables.data ?? []).filter((t: ChipTable) => t.status === "Open" && t.open_until > now && !t.players.some((p) => p.player === accountId)),
    [tables.data, accountId, now],
  );

  const setCurrentTable = setCurrent;

  const inviteTable = invited.data ?? null;
  const inviteSeated = !!inviteTable && !!accountId && inviteTable.players.some((p) => p.player === accountId);
  const inviteOpen = !!inviteTable && inviteTable.status === "Open" && inviteTable.open_until > now && inviteTable.players.length < inviteTable.seats;
  /** The invited table takes over step 3 while it still has a seat for this player. */
  const joining = inviteOpen && !inviteSeated ? inviteTable : null;
  const stakeChip = joining ? joining.stake : BigInt(stake) * CHIP;

  // If the tab closed while open_table was in flight, the host's pick is still under the pending
  // key. Once the new table shows up with the matching commitment, file the pick under its id and
  // send it to the settler. Only local storage changes here.
  useEffect(() => {
    if (!accountId || !tables.data) return;
    const raw = window.localStorage.getItem(pickStore(accountId, PENDING_TABLE));
    if (!raw) return;
    const list = tables.data;
    void (async () => {
      const pick = JSON.parse(raw) as { market: string; salt: string };
      const commitment = await pickCommitment(accountId, pick.market, pick.salt);
      const table = list.find((t) => t.players.some((p) => p.player === accountId && p.commitment === commitment));
      if (!table) return;
      window.localStorage.setItem(pickStore(accountId, table.id), raw);
      window.localStorage.removeItem(pickStore(accountId, PENDING_TABLE));
      void deliverPick(table.id, accountId);
    })();
  }, [accountId, tables.data]);

  async function enable() {
    setBusy("key");
    setMessage(null);
    const result = await near.enableGameKey(!starterClaimed);
    setBusy(null);
    if (!result.ok) setMessage({ tone: "danger", text: `The wallet did not approve: ${result.message}. You can still play; each move will ask your wallet.` });
    await holder.refresh();
  }

  async function claimOnly() {
    setBusy("claim");
    const result = await near.call("claim_starter", {});
    setBusy(null);
    setMessage(result.success ? { tone: "info", text: "1,000 CHIP claimed.", link: result.explorerUrl } : { tone: "danger", text: failureMessage(result.failure) });
    await holder.refresh();
  }

  async function sit(tableId: string) {
    if (!accountId || !chosen) return;
    const market = chosen;
    const salt = newSalt();
    // Saved before the seat transaction: the pick must survive a closed tab.
    window.localStorage.setItem(pickStore(accountId, tableId), JSON.stringify({ market, salt }));
    const commitment = await pickCommitment(accountId, market, salt);
    const joined = await near.call("join_table", { table_id: tableId, commitment });
    if (!joined.success) {
      setMessage({ tone: "danger", text: failureMessage(joined.failure), link: joined.explorerUrl });
      return false;
    }
    setCurrentTable(tableId);
    const delivered = await deliverPick(tableId, accountId);
    if (!delivered.ok) setMessage({ tone: "warning", text: `You are seated, but the pick did not reach the settler yet: ${delivered.message}. Use "Send my pick again" on the table.` });
    return true;
  }

  async function playHouse() {
    if (!chosen) return;
    setBusy("house");
    setMessage(null);
    try {
      // A call table: the server sets the round from the auction's end and the House calls a side.
      const body = callAuction ? { stakeChip: stake, roundSeconds: round, callMemeId: callAuction.id } : { stakeChip: stake, roundSeconds: round };
      const response = await fetch("/api/near/house-table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const reply = (await response.json()) as { tableId?: string; error?: { message: string } };
      if (!response.ok || !reply.tableId) {
        setMessage({ tone: "warning", text: reply.error?.message ?? "The House could not open a table." });
        return;
      }
      await sit(reply.tableId);
    } finally {
      setBusy(null);
      void tables.refresh();
      void holder.refresh();
    }
  }

  /** Opens a table this player hosts, seated with their sealed pick, for friends to join by link. */
  async function openFriends() {
    if (!accountId || !chosen) return;
    setBusy("friends");
    setMessage(null);
    const pending = pickStore(accountId, PENDING_TABLE);
    try {
      const market = chosen;
      // A call table runs until the auction ends, and must fill while it still cooks.
      const roundSeconds = callAuction ? callRoundSeconds(callAuction.endsAt, Date.now()) : round;
      const openSeconds = callAuction ? callOpenSeconds(callAuction.endsAt, Date.now(), FRIEND_OPEN_SECONDS) : FRIEND_OPEN_SECONDS;
      if (roundSeconds === null || openSeconds === null) {
        setMessage({ tone: "warning", text: "This auction ends too soon for a call table. Pick another call or a coin." });
        return;
      }
      const salt = newSalt();
      const pick = JSON.stringify({ market, salt });
      // Saved before the transaction, like every pick: a closed tab must not lose it.
      window.localStorage.setItem(pending, pick);
      const commitment = await pickCommitment(accountId, market, salt);
      const opened = await near.call<string>("open_table", { stake: (BigInt(stake) * CHIP).toString(), seats, round_seconds: roundSeconds, open_seconds: openSeconds, commitment });
      if (!opened.success) {
        window.localStorage.removeItem(pending);
        setMessage({ tone: "danger", text: failureMessage(opened.failure), link: opened.explorerUrl });
        return;
      }
      const tableId = openedTableId(opened);
      if (!tableId) {
        setMessage({ tone: "warning", text: "The table opened, but its number was not in the reply. It appears under your tables in a few seconds.", link: opened.explorerUrl });
        return;
      }
      window.localStorage.setItem(pickStore(accountId, tableId), pick);
      window.localStorage.removeItem(pending);
      setCurrentTable(tableId);
      const [delivered, copied] = await Promise.all([deliverPick(tableId, accountId), copyText(inviteUrl(tableId))]);
      if (!delivered.ok) setMessage({ tone: "warning", text: `The table is open, but your pick did not reach the settler yet: ${delivered.message}. Use "Send my pick again" on the table.` });
      else setMessage({ tone: "info", text: copied ? `Table ${tableId} is open and its challenge link is copied. Send it to a friend.` : `Table ${tableId} is open. Copy its challenge link from the table above.` });
    } finally {
      setBusy(null);
      void tables.refresh();
      void holder.refresh();
    }
  }

  async function join(table: ChipTable) {
    setBusy(`join:${table.id}`);
    setMessage(null);
    try {
      await sit(table.id);
    } finally {
      setBusy(null);
      void holder.refresh();
    }
  }

  const today = stats.data;
  const secondsToUtcMidnight = 86_400 - (now % 86_400);

  return (
    <div className="mx-auto w-full max-w-[var(--container-app)] px-4 pb-16 pt-8 md:px-8">
      {/* The heading spans both columns, so the play card and the sidebar start on the same line. */}
      <div className="mb-6">
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[44px]">{invite ? `Join table ${invite}` : "Play the House"}</h1>
        <p className="mt-2 max-w-[640px] text-[16px] text-text-secondary">
          {invite
            ? "A friend saved you a seat. Pick the coin on NEAR you think rises most; the best % move takes the pot, and 10% of it burns."
            : "Pick the coin on NEAR you think rises most and take the seat across from the House, or open a table for friends. The best % move takes the pot, and 10% of it burns."}
        </p>
      </div>
      {/* A friend's invite goes straight to the table; everyone else sees what is cooking first. */}
      {invite ? null : (
        <div className="mb-5">
          <LaunchLobby />
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="space-y-5">

          {current && accountId ? (
            <TableView tableId={current} viewer={accountId} onLeave={() => setCurrentTable(null)} onSupplyChange={() => void stats.refresh()} />
          ) : null}

          {invite && current !== invite ? (
            <Card className="kova-edge p-5" as="section">
              {inviteTable ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[16px] font-semibold text-text-primary">
                      Table {inviteTable.id} · {formatChip(inviteTable.stake)} CHIP each
                    </p>
                    {joining ? <LiveBadge label={`Seats close in ${clock(inviteTable.open_until - now)}`} /> : <Badge tone="neutral">{inviteTable.status === "Open" ? "Seats closed" : inviteTable.status}</Badge>}
                  </div>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    Hosted by {inviteTable.host === HOUSE_ACCOUNT ? "the House" : displayAccount(inviteTable.host)} · {inviteTable.players.length} of {inviteTable.seats} seated · {inviteTable.round_seconds} s round
                  </p>
                  <p className="mt-1 text-[12px] text-text-muted">
                    At the table: {inviteTable.players.map((p) => (p.player === HOUSE_ACCOUNT ? "The House" : p.player === accountId ? "you" : displayAccount(p.player))).join(", ")}
                  </p>
                  {joining ? (
                    <p className="mt-3 text-[13px] text-text-primary">Pick your coin in step 3 and join. Your pick stays sealed until the round starts.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="text-[13px] text-text-primary">{inviteSeated ? "You have a seat at this table." : "This table is no longer taking seats. You can watch it, or play the House below."}</p>
                      <Button size="sm" variant="secondary" onClick={() => setCurrentTable(inviteTable.id)} disabled={!accountId}>
                        {inviteSeated ? `Open table ${inviteTable.id}` : `Watch table ${inviteTable.id}`}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[14px] text-text-secondary">
                  {invited.error ? `Could not read table ${invite}: ${invited.error}` : invited.updatedAt ? `There is no table ${invite}. Check the link, or play the House below.` : `Reading table ${invite} from the contract…`}
                </p>
              )}
            </Card>
          ) : null}

          <Card className="space-y-5 p-5">
            <Step index={1} title={near.status === "signed_in" && accountId ? `Signed in as ${displayAccount(accountId)}` : "Connect a NEAR testnet wallet"} done={near.status === "signed_in"}>
              {near.status !== "signed_in" ? (
                <Button iconLeft={<Wallet size={16} />} onClick={() => void near.connect()} loading={near.status === "loading"} loadingLabel="Checking wallet…">
                  Connect wallet
                </Button>
              ) : (
                <button type="button" className="text-[13px] text-text-secondary underline-offset-2 hover:underline" onClick={() => void near.disconnect()}>
                  Sign out
                </button>
              )}
            </Step>

            <Step index={2} title={keyActive ? `Game key on. ${balance !== null ? `${formatChip(balance)} CHIP` : ""}` : "Turn on the game key and get 1,000 CHIP"} done={keyActive && hasChips}>
              {near.status === "signed_in" && !keyActive ? (
                <div className="space-y-2">
                  <Button iconLeft={<KeyRound size={16} />} onClick={() => void enable()} loading={busy === "key" || near.keyState === "pending"} loadingLabel="Waiting for your wallet…">
                    {starterClaimed ? "Turn on the game key" : "Approve once and get 1,000 CHIP"}
                  </Button>
                  <p className="text-[12px] leading-5 text-text-muted">
                    One approval adds a key that can only call CHIP&apos;s game methods, with at most 0.25 NEAR of gas. It cannot move your NEAR or CHIP. After that, playing needs no wallet popups.
                  </p>
                </div>
              ) : null}
              {keyActive && !starterClaimed ? (
                <Button variant="secondary" iconLeft={<Coins size={16} />} onClick={() => void claimOnly()} loading={busy === "claim"} loadingLabel="Claiming…">
                  Get 1,000 CHIP
                </Button>
              ) : null}
            </Step>

            <Step index={3} title={joining ? `Join table ${joining.id}` : mode === "friends" ? "Challenge a friend" : "Play the House"}>
              <fieldset className="space-y-3" disabled={near.status !== "signed_in"}>
                {!joining ? (
                  <div role="radiogroup" aria-label="Who you play against" className="inline-flex gap-1 rounded-xl border border-border-subtle bg-surface-2 p-1">
                    {(
                      [
                        ["house", "The House"],
                        ["friends", "Challenge a friend"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={mode === value}
                        onClick={() => setMode(value)}
                        className={cn("h-10 rounded-lg px-3 text-[13px] font-semibold transition-colors", mode === value ? "bg-accent-soft text-text-primary" : "text-text-secondary hover:text-text-primary")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div>
                  <legend className="mb-1.5 text-[12px] font-medium text-text-secondary">Your pick: the coin you think rises most. Each pick is scored by its % move over the round; the best move wins.</legend>
                  <div role="radiogroup" aria-label="Pick a coin traded on NEAR, or call a meme.cooking auction" className="space-y-3">
                    {callable.length ? (
                      <div>
                        <p className="text-[12px] font-semibold text-text-primary">Will it cook?</p>
                        <p className="mb-1.5 text-[11px] text-text-muted">
                          Call whether a meme.cooking auction reaches its launch line before it ends. The round runs until it ends; the settler reads the result from meme.cooking&apos;s contract and the right call scores +100%.
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                          {callable.flatMap((a) =>
                            (["cooks", "flops"] as const).map((side) => {
                              const id = callMarket(a.id, callSymbol(a.symbol), side);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  role="radio"
                                  aria-checked={chosen === id}
                                  onClick={() => setMarket(id)}
                                  className={cn("min-h-11 rounded-xl border px-3 py-2 text-left transition-colors", chosen === id ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-2 hover:border-border-strong")}
                                >
                                  <span className="block text-[14px] font-semibold text-text-primary">
                                    {a.symbol} {side === "cooks" ? "cooks" : "does not cook"}
                                  </span>
                                  <span className="num block text-[11px] text-text-muted">
                                    {formatNear(BigInt(a.raised))} of {formatNear(BigInt(a.softCap), 0)} NEAR · {timeLeft(a.endsAt, now)}
                                  </span>
                                </button>
                              );
                            }),
                          )}
                        </div>
                      </div>
                    ) : null}
                    {MARKET_GROUPS.map(({ group, title, hint }) => {
                      const rows = (markets.data ?? []).filter((m) => m.group === group);
                      if (!rows.length) return null;
                      return (
                        <div key={group}>
                          <p className="text-[12px] font-semibold text-text-primary">{title}</p>
                          <p className="mb-1.5 text-[11px] text-text-muted">
                            {hint}
                            {group === "launch"
                              ? rows
                                  .filter((m) => m.memeCookingId !== undefined)
                                  .map((m) => (
                                    <a key={m.id} className="ml-2 inline-flex items-center gap-0.5 underline" href={memeUrl(m.memeCookingId as number)} target="_blank" rel="noreferrer">
                                      {m.symbol} on meme.cooking <ArrowUpRight size={11} aria-hidden="true" />
                                    </a>
                                  ))
                              : null}
                          </p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                            {rows.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                role="radio"
                                aria-checked={chosen === m.id}
                                disabled={!m.available}
                                title={m.available ? m.name : m.reason}
                                onClick={() => setMarket(m.id)}
                                className={cn(
                                  "min-h-11 rounded-xl border px-3 py-2 text-left transition-colors",
                                  chosen === m.id ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-2 hover:border-border-strong",
                                  !m.available && "cursor-not-allowed opacity-40",
                                )}
                              >
                                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
                                  {m.symbol}
                                  {m.available && m.trades5m ? <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" /> : null}
                                </span>
                                <span className="num block text-[11px] text-text-muted">{marketActivity(m)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {!markets.data ? <p className="text-[13px] text-text-muted">{markets.error ? `Markets unavailable: ${markets.error}` : "Loading NEAR markets…"}</p> : null}
                  </div>
                  <p className="mt-1.5 text-[11px] text-text-muted">Mainnet prices from one fixed Rhea pool per coin, read through DEX Screener, scoring a game played with a testnet token.</p>
                  {quietPick ? (
                    <p className="mt-1.5 text-[12px] text-warning" role="status">
                      {quietPick.symbol} has not traded in the last 5 minutes. In a {round} s round it will most likely score 0.
                    </p>
                  ) : null}
                </div>
                {joining ? (
                  <p className="text-[13px] text-text-secondary">
                    Stake <span className="num font-semibold text-text-primary">{formatChip(joining.stake)} CHIP</span> and a <span className="num font-semibold text-text-primary">{joining.round_seconds} s</span> round, set by the host.
                  </p>
                ) : (
                <div className="flex flex-wrap gap-4">
                  {mode === "friends" ? (
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Seats</p>
                      <div role="radiogroup" aria-label="Seats at the table, you included" className="flex gap-1.5">
                        {SEAT_CHOICES.map((n) => (
                          <button key={n} type="button" role="radio" aria-checked={seats === n} onClick={() => setSeats(n)} className={cn("num h-11 min-w-11 rounded-lg border px-3 text-[13px] font-semibold", seats === n ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary")}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Stake</p>
                    <div role="radiogroup" aria-label="Stake" className="flex gap-1.5">
                      {STAKES.map((s) => (
                        <button key={s} type="button" role="radio" aria-checked={stake === s} onClick={() => setStake(s)} className={cn("num h-11 min-w-12 rounded-lg border px-3 text-[13px] font-semibold", stake === s ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary")}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Round</p>
                    {callAuction ? (
                      <p className="num flex h-11 items-center text-[13px] text-text-secondary">Until {callAuction.symbol} ends, then about a minute: {callRound !== null ? `${Math.ceil(callRound / 60)} min` : "closed"}</p>
                    ) : (
                    <div role="radiogroup" aria-label="Round length" className="flex gap-1.5">
                      {ROUNDS.map((r) => (
                        <button key={r.seconds} type="button" role="radio" aria-checked={round === r.seconds} onClick={() => setRound(r.seconds)} className={cn("num h-11 rounded-lg border px-3 text-[13px] font-semibold", round === r.seconds ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary")}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    )}
                  </div>
                </div>
                )}
                {joining ? (
                  <Button
                    size="lg"
                    iconLeft={<Users size={18} />}
                    disabled={!chosen || !hasChips || (balance !== null && balance < stakeChip) || !!busy}
                    loading={busy === `join:${joining.id}`}
                    loadingLabel="Taking your seat…"
                    onClick={() => void join(joining)}
                  >
                    Join table {joining.id} for {formatChip(joining.stake)} CHIP
                  </Button>
                ) : mode === "friends" ? (
                  <div className="space-y-1.5">
                    <Button
                      size="lg"
                      iconLeft={<Users size={18} />}
                      disabled={!chosen || !hasChips || (balance !== null && balance < stakeChip) || !!busy}
                      loading={busy === "friends"}
                      loadingLabel="Opening your table…"
                      onClick={() => void openFriends()}
                    >
                      {seats === 2 ? `Challenge a friend for ${stake} CHIP` : `Open a ${seats}-seat challenge for ${stake} CHIP`}
                    </Button>
                    <p className="text-[12px] leading-5 text-text-muted">
                      You take the first seat and the challenge link is copied for you to send; seats stay open for {callAuction ? "until shortly before the auction ends" : "10 minutes"}. The round starts when the table fills or you start it with two or more players. If neither happens, every stake comes back.
                    </p>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    iconLeft={<Swords size={18} />}
                    disabled={!chosen || !hasChips || (balance !== null && balance < stakeChip) || !!busy}
                    loading={busy === "house"}
                    loadingLabel="Opening the table…"
                    onClick={() => void playHouse()}
                  >
                    Play the House for {stake} CHIP
                  </Button>
                )}
                {!joining && mode === "house" && house.data && BigInt(house.data.balance) < BigInt(stake) * CHIP ? (
                  <p className="text-[12px] text-warning">The House has {formatChip(BigInt(house.data.balance))} CHIP and sits out at this stake.</p>
                ) : null}
              </fieldset>
            </Step>

            {message ? (
              <InlineNotice tone={message.tone}>
                {message.text}{" "}
                {message.link ? (
                  <a className="underline" href={message.link} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                ) : null}
              </InlineNotice>
            ) : null}
            {near.error ? <InlineNotice tone="danger">{near.error}</InlineNotice> : null}
          </Card>

          {openTables.length ? (
            <Card className="p-5">
              <h2 className="font-display text-[18px] font-bold text-text-primary">Open tables</h2>
              <ul className="mt-3 divide-y divide-border-subtle">
                {openTables.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-text-primary">
                        Table {t.id} · {formatChip(t.stake)} CHIP · {t.round_seconds}s
                      </p>
                      <p className="text-[12px] text-text-muted">
                        {t.players.map((p) => (p.player === HOUSE_ACCOUNT ? "The House" : displayAccount(p.player))).join(", ")} · {t.players.length}/{t.seats} seats
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" disabled={!chosen || near.status !== "signed_in" || !!busy} loading={busy === `join:${t.id}`} onClick={() => void join(t)}>
                      Join with my pick
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card className="p-5">
            <SupplyCounter supply={stats.data?.total_supply ?? null} stale={stats.stale} />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-text-muted">Burned so far</dt>
                <dd className="num font-semibold text-text-primary">{today ? formatChip(today.total_burned) : "…"}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Treasury</dt>
                <dd className="num font-semibold text-text-primary">{today ? formatChip(today.treasury) : "…"}</dd>
              </div>
            </dl>
            <Link href="/near/token" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#b79bff] hover:text-[#d0bdff]">
              Token page and full log <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-text-primary">Today&apos;s call</p>
              <Badge tone="outline" icon={<Timer size={12} />}>
                <span className="num">
                  {Math.floor(secondsToUtcMidnight / 3600)}h {Math.floor((secondsToUtcMidnight % 3600) / 60)}m left
                </span>
              </Badge>
            </div>
            <p className="num mt-3 text-[26px] font-bold text-text-primary">
              {today ? today.today_settled_tables : "…"} <span className="text-[15px] font-medium text-text-muted">/ {today?.daily_target_tables ?? 30} tables</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Settled tables today against the target" aria-valuemin={0} aria-valuemax={today?.daily_target_tables ?? 30} aria-valuenow={today?.today_settled_tables ?? 0}>
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, ((today?.today_settled_tables ?? 0) / (today?.daily_target_tables ?? 30)) * 100)}%` }} />
            </div>
            <p className="mt-3 text-[12px] leading-5 text-text-secondary">
              Hit the target and everyone who played today shares 2,000 new CHIP, with a double share for the leading clan. Miss it and 1% of the treasury burns.
            </p>
            {today ? <DailyClaim today={today.today} launchDay={today.launch_day} /> : null}
          </Card>

          <ClanCard />

          <NearLeaderboard compact limit={5} viewer={accountId} />

          {holder.data && holder.data.pending_blind > 0n ? (
            <InlineNotice tone="warning">
              You owe a {formatChip(holder.data.pending_blind)} CHIP blind for sitting out. It is collected on your next move. Play a table to reset the clock.
            </InlineNotice>
          ) : null}

          <Card className="p-5 text-[12px] leading-5 text-text-secondary">
            <p>
              House: <a className="underline" href={nearNetwork.explorerAccount(HOUSE_ACCOUNT)} target="_blank" rel="noreferrer">{HOUSE_ACCOUNT}</a>
              {house.data ? <> · bankroll <span className="num">{formatChip(BigInt(house.data.balance))}</span> CHIP</> : null}
            </p>
            <p className="mt-1">The House plays from its own account. If its bankroll runs out, it sits out.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
