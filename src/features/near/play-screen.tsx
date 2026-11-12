"use client";

import { ArrowUpRight, Coins, KeyRound, Swords, Timer, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CHIP, type ChipTable, failureMessage, formatChip, newSalt, pickCommitment } from "@/adapters/near/chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
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
  group: "busy" | "meme";
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
  { group: "meme", title: "NEAR memecoins", hint: "Thin pools that trade a few times an hour. A coin with no trades scores 0, so short rounds often tie." },
] as const;

function marketActivity(m: Market): string {
  if (!m.available) return "unavailable";
  const move = m.change1hPct !== null && m.change1hPct !== undefined ? `${m.change1hPct > 0 ? "+" : ""}${m.change1hPct}% 1h · ` : "";
  const trades = m.trades5m ? `${m.trades5m} trades in 5 min` : m.trades1h ? `${m.trades1h} trades in 1h` : "no trades in 1h";
  return `${move}${trades}`;
}

const STAKES = [10, 25, 50, 100] as const;
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

export function PlayScreen() {
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

  // The first available market (a busy one when any is up) is the default until the player chooses one.
  const chosen = market ?? markets.data?.find((m) => m.available)?.id ?? null;
  const chosenMarket = markets.data?.find((m) => m.id === chosen) ?? null;
  const quietPick = chosenMarket?.available && round <= 90 && !chosenMarket.trades5m ? chosenMarket : null;
  const now = useNow();

  const balance = holder.data?.balance ?? null;
  const hasChips = balance !== null && balance > 0n;
  const starterClaimed = holder.data?.starter_claimed ?? false;
  const keyActive = near.keyState === "active";

  const openTables = useMemo(
    () => (tables.data ?? []).filter((t: ChipTable) => t.status === "Open" && t.open_until > now && !t.players.some((p) => p.player === accountId)),
    [tables.data, accountId, now],
  );

  const setCurrentTable = setCurrent;

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
      const response = await fetch("/api/near/house-table", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stakeChip: stake, roundSeconds: round }) });
      const body = (await response.json()) as { tableId?: string; error?: { message: string } };
      if (!response.ok || !body.tableId) {
        setMessage({ tone: "warning", text: body.error?.message ?? "The House could not open a table." });
        return;
      }
      await sit(body.tableId);
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
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-6 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-[-0.01em] text-text-primary sm:text-[34px]">Poker for meme coins, with a chip that burns</h1>
            <p className="mt-2 max-w-[620px] text-[15px] text-text-secondary">
              Stake CHIP, pick the NEAR memecoin you think moves most, and beat the House. Every pot burns 10% of itself, so every round you play shrinks CHIP&apos;s supply.
            </p>
          </div>

          {current && accountId ? (
            <TableView tableId={current} viewer={accountId} onLeave={() => setCurrentTable(null)} onSupplyChange={() => void stats.refresh()} />
          ) : null}

          <Card className="space-y-5 p-5">
            <Step index={1} title={near.status === "signed_in" ? `Signed in as ${accountId}` : "Connect a NEAR testnet wallet"} done={near.status === "signed_in"}>
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

            <Step index={3} title="Play the House">
              <fieldset className="space-y-3" disabled={near.status !== "signed_in"}>
                <div>
                  <legend className="mb-1.5 text-[12px] font-medium text-text-secondary">Your pick: the coin you think rises most. Each pick is scored by its % move over the round; the best move wins.</legend>
                  <div role="radiogroup" aria-label="Pick a coin traded on NEAR" className="space-y-3">
                    {MARKET_GROUPS.map(({ group, title, hint }) => {
                      const rows = (markets.data ?? []).filter((m) => m.group === group);
                      if (!rows.length) return null;
                      return (
                        <div key={group}>
                          <p className="text-[12px] font-semibold text-text-primary">{title}</p>
                          <p className="mb-1.5 text-[11px] text-text-muted">{hint}</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                <div className="flex flex-wrap gap-4">
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
                    <div role="radiogroup" aria-label="Round length" className="flex gap-1.5">
                      {ROUNDS.map((r) => (
                        <button key={r.seconds} type="button" role="radio" aria-checked={round === r.seconds} onClick={() => setRound(r.seconds)} className={cn("num h-11 rounded-lg border px-3 text-[13px] font-semibold", round === r.seconds ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary")}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  iconLeft={<Swords size={18} />}
                  disabled={!chosen || !hasChips || (balance !== null && balance < BigInt(stake) * CHIP) || !!busy}
                  loading={busy === "house"}
                  loadingLabel="Opening the table…"
                  onClick={() => void playHouse()}
                >
                  Play the House for {stake} CHIP
                </Button>
                {house.data && BigInt(house.data.balance) < BigInt(stake) * CHIP ? (
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
                        {t.players.map((p) => p.player).join(", ")} · {t.players.length}/{t.seats} seats
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
              Hit the target and everyone who played today shares 2,000 new CHIP. Miss it and 1% of the treasury burns.
            </p>
          </Card>

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
