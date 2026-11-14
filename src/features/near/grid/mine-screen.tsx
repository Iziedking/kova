"use client";

import { ArrowLeft, Flame, Play, Repeat, Square, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { failureMessage } from "@/adapters/near/chip";
import { GAS, GRID_CHIP, SQUARES, burnedTotal, estimateWin, formatUnits, needsRegistration, parseUnits, shortAccount, squareNumber, stakeCall } from "@/adapters/near/grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, SectionHeader } from "@/components/ui/section";
import { ErrorState, InlineNotice } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { GridGate } from "./grid-gate";
import { MineBoard } from "./mine-board";
import { registerMine } from "./register-mine";
import { getGrid, useGridPlayer } from "./use-grid";
import { ExplorerLink, Page, Stat, mmss, timeAgo } from "./ui";

const PRESETS = ["1", "10", "50", "100"];

export function MineScreen({ token }: { token: string }) {
  const grid = getGrid();
  const player = useGridPlayer();
  const { near, accountId } = player;
  const now = useNow();
  const isChip = token === GRID_CHIP;

  const info = usePoll(() => grid.mineFor(token), 60_000, `mine:${token}`);
  const mine = info.data?.mine ?? null;
  const meta = usePoll(() => grid.metadata(token), 60_000, `meta:${token}`);
  const cfg = usePoll(mine ? () => grid.config(mine) : null, 60_000, `cfg:${mine}`);
  const cur = usePoll(mine ? () => grid.currentRound(mine) : null, 5_000, `cur:${mine}`);
  const stats = usePoll(mine ? () => grid.stats(mine) : null, 15_000, `stats:${mine}`);
  const recent = usePoll(mine ? () => grid.recent(mine, 12) : null, 15_000, `recent:${mine}`);
  const roundId = cur.data?.id ?? 0;
  const thisRound = usePoll(mine && roundId && accountId ? () => grid.round(mine, roundId) : null, 6_000, `round:${mine}:${roundId}`);
  // The newest round that ended with stakes still waiting for a result. The last three are always
  // checked; when the mine still holds coins from older rounds (nobody settled them), it looks back
  // up to 30 minutes so a stuck round can be refunded from this page.
  const lastRound = usePoll(
    mine && roundId
      ? async () => {
          for (const id of [roundId - 1, roundId - 2, roundId - 3]) {
            const r = await grid.round(mine, id);
            if (r) return r;
          }
          const [s, c] = await Promise.all([grid.stats(mine), grid.currentRound(mine)]);
          if (s.held <= c.total) return null;
          for (let id = roundId - 4; id >= roundId - 30; id -= 1) {
            const r = await grid.round(mine, id);
            if (r) return r;
          }
          return null;
        }
      : null,
    12_000,
    `waiting:${mine}:${roundId}`,
  );
  const coin = usePoll(accountId ? () => grid.balance(token, accountId) : null, 10_000, `coin:${token}:${accountId}`);
  // A coin can only send to a mine it has registered (NEP-145).
  const registered = usePoll(mine ? () => grid.storageBalance(token, mine) : null, 20_000, `registered:${token}:${mine}`);
  const owed = usePoll(mine && accountId ? () => grid.claimable(mine, accountId) : null, 20_000, `owed:${mine}:${accountId}`);

  const [selected, setSelected] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("10");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "danger"; text: string; url?: string } | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoTotal, setAutoTotal] = useState(5);
  const autoRound = useRef(0);
  const busyRef = useRef(false);

  const decimals = meta.data?.decimals ?? 18;
  const symbol = meta.data?.symbol ?? "…";
  const open = cur.data?.open ?? false;
  const secondsLeft = cur.data && now ? Math.max(0, cur.data.ends_at - now) : null;
  const totals = cur.data?.totals ?? Array<bigint>(SQUARES).fill(0n);
  const myStakes = Array<bigint>(SQUARES).fill(0n);
  for (const s of thisRound.data?.stakes ?? []) if (s.player === accountId) myStakes[s.square] += s.amount;
  const stakedByMe = myStakes.reduce((a, b) => a + b, 0n);
  const maxStake = cfg.data?.max_stake ?? 0n;
  const minStake = cfg.data?.min_stake ?? 0n;
  const remaining = maxStake > stakedByMe ? maxStake - stakedByMe : 0n;
  const amount = parseUnits(amountText, decimals);
  const lastResult = recent.data?.[0] ?? null;
  const lastWinner = lastResult && lastResult.outcome === "settled" ? lastResult.winning_square : null;
  const signedIn = near.status === "signed_in" && !!accountId;
  const canStake = signedIn && (!isChip || player.keyActive);
  const needsSettle = !!lastRound.data && !!cur.data && now > 0 && now >= cur.data.starts_at;

  const unregistered = registered.data !== null && needsRegistration(registered.data);
  let problem: string | null = null;
  if (unregistered) problem = `Register this mine with ${symbol} first.`;
  else if (!cfg.data || !meta.data) problem = cfg.error || meta.error ? "Could not load limits. Retrying." : "Loading…";
  else if (amount === null) problem = "Enter an amount.";
  else if (amount < minStake) problem = `Minimum is ${formatUnits(minStake, decimals)} ${symbol}.`;
  else if (amount > remaining) problem = remaining === 0n ? `Round limit reached (${formatUnits(maxStake, decimals)} ${symbol}).` : `You can stake ${formatUnits(remaining, decimals)} ${symbol} more.`;
  else if (coin.data !== null && amount > coin.data) problem = `You have ${formatUnits(coin.data, decimals)} ${symbol}.`;

  async function stake(square: number, units: bigint, auto = false): Promise<boolean> {
    if (!mine || !cur.data) return false;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    const round = cur.data.id;
    const call = stakeCall({ token, mine, square, units, round });
    const result = await near.callContract(call.contractId, call.method, call.args, { gas: call.gas, deposit: call.deposit });
    busyRef.current = false;
    setBusy(false);
    const staked = result.events.some((e) => e.event === "staked");
    const refused = result.events.find((e) => e.event === "refused");
    if (result.success && staked) {
      setNotice({ tone: "info", text: `${auto ? "Auto-mined" : "Staked"} ${formatUnits(units, decimals)} ${symbol} on square ${squareNumber(square)}.`, url: result.explorerUrl });
    } else {
      const reason = refused ? String(refused.data[0]?.reason ?? "refused") : failureMessage(result.failure);
      setNotice({ tone: "danger", text: `Not staked: ${reason}. ${refused ? "Coins returned." : ""}`.trim(), url: result.explorerUrl || undefined });
    }
    thisRound.refresh();
    cur.refresh();
    coin.refresh();
    player.refresh();
    return result.success && staked;
  }

  async function register() {
    if (!mine) return;
    setBusy(true);
    setNotice(null);
    const result = await registerMine(near, grid, token, mine);
    setBusy(false);
    setNotice(result.ok ? { tone: "info", text: `Registered. You can stake ${symbol} now.`, url: result.url } : { tone: "danger", text: `Could not register: ${result.message}`, url: result.url });
    registered.refresh();
  }

  const isRefundOnly = (round: number) => now > 0 && now - (round + 1) * 60 >= 600;

  async function settle(round: number) {
    if (!mine) return;
    setBusy(true);
    setNotice(null);
    // After ten minutes a round can no longer be settled, only refunded (every stake goes back).
    const refund = isRefundOnly(round);
    const result = await near.callContract(mine, refund ? "refund_round" : "settle", { round: String(round) }, { gas: GAS.settle });
    setBusy(false);
    setNotice(result.success ? { tone: "info", text: refund ? `Round ${round} refunded. Every stake was returned.` : `Round ${round} finished. See the result below.`, url: result.explorerUrl } : { tone: "danger", text: `Could not ${refund ? "refund" : "settle"}: ${failureMessage(result.failure)}`, url: result.explorerUrl || undefined });
    recent.refresh();
    stats.refresh();
    lastRound.refresh();
    coin.refresh();
  }

  async function claim() {
    if (!mine) return;
    setBusy(true);
    const result = await near.callContract(mine, "claim", {}, { gas: GAS.claim });
    setBusy(false);
    setNotice(result.success ? { tone: "info", text: "Claimed.", url: result.explorerUrl } : { tone: "danger", text: `Could not claim: ${failureMessage(result.failure)}`, url: result.explorerUrl || undefined });
    owed.refresh();
    coin.refresh();
  }

  // Auto-mine: once per round, while the page stays open, on a random square. The work runs in a
  // timer callback so state changes follow the chain read instead of cascading inside the effect.
  const live = cur.data;
  const autoAmount = amount;
  useEffect(() => {
    if (autoLeft <= 0 || !live || !live.open || busyRef.current || autoRound.current === live.id) return;
    if (live.ends_at - now < 8) return;
    const timer = setTimeout(() => {
      if (autoRound.current === live.id || busyRef.current) return;
      autoRound.current = live.id;
      if (autoAmount === null || autoAmount < minStake || autoAmount > remaining || (coin.data !== null && autoAmount > coin.data)) {
        setAutoLeft(0);
        setNotice({ tone: "danger", text: "Auto-mine stopped: amount not allowed (balance or limit)." });
        return;
      }
      void stake(Math.floor(Math.random() * SQUARES), autoAmount, true).then((ok) => {
        if (!ok) setAutoLeft(0);
        else setAutoLeft((n) => Math.max(0, n - 1));
      });
    }, 0);
    return () => clearTimeout(timer);
  });

  if (info.data === null && info.error) return <Page><ErrorState title="Could not load this mine" body={info.error} /></Page>;
  if (info.data === null && !info.error) return <Page><Skeleton className="h-96 w-full" /></Page>;
  if (!info.data || !mine) {
    return (
      <Page>
        <ErrorState title="No mine for this coin yet" body={<>No mine for {token}. <Link className="text-[#b79bff] underline" href="/near/open">Open one</Link>.</>} />
      </Page>
    );
  }

  const winnersOfLast = lastResult?.outcome === "settled" ? lastResult.winners : [];
  const stakeDisabled = !canStake || !open || selected === null || problem !== null || amount === null;
  const stakeLabel = selected === null ? "Pick a square" : `Put ${amountText || "…"} ${symbol} on square ${squareNumber(selected)}`;
  const showBar = selected !== null && signedIn;
  const estimate = selected !== null && amount !== null ? estimateWin(totals, selected, amount) : null;

  return (
    <Page className={cn("space-y-5", showBar && "pb-36 lg:pb-16")}>
      <Link href="/near/mines" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary">
        <ArrowLeft size={14} aria-hidden="true" /> All mines
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[38px]">{symbol} mine</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Mine <ExplorerLink href={grid.accountUrl(mine)}>{shortAccount(mine, 30)}</ExplorerLink> · coin <ExplorerLink href={grid.accountUrl(token)}>{shortAccount(token, 26)}</ExplorerLink>
          </p>
        </div>
        <div className="flex items-center gap-3" aria-live="polite">
          <Badge tone={open ? "success" : "warning"} dot>{open ? "Round open" : "Closed"}</Badge>
          <span className="num text-[28px] font-bold text-text-primary" aria-label={secondsLeft === null ? "Loading" : `${secondsLeft} seconds left`}>{secondsLeft === null ? "–:––" : mmss(secondsLeft)}</span>
        </div>
      </div>

      {!open && cur.data ? <InlineNotice tone="info">Closed for the last minute of the UTC day. Reopens in {secondsLeft ?? "a few"} seconds.</InlineNotice> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="space-y-4">
          {cur.data ? (
            <MineBoard totals={totals} mine={myStakes} decimals={decimals} symbol={symbol} selected={selected} lastWinner={lastWinner} disabled={!open || busy} onSelect={setSelected} />
          ) : (
            <Skeleton className="aspect-square w-full" />
          )}
          <p className="num text-[13px] text-text-muted">
            Round {cur.data?.id ?? "…"} · {formatUnits(cur.data?.total ?? 0n, decimals)} {symbol} from {cur.data?.players ?? 0} player{cur.data?.players === 1 ? "" : "s"} · {formatUnits(stakedByMe, decimals)} {symbol} yours
          </p>
        </div>

        <div className="space-y-4">
          {unregistered ? (
            <InlineNotice tone="warning">
              <span className="flex flex-wrap items-center gap-3">
                Not registered with {symbol} yet. Anyone can register it (about 0.00125 NEAR).
                <Button size="sm" variant="secondary" disabled={!signedIn} loading={busy} loadingLabel="Registering…" onClick={() => void register()}>Register</Button>
              </span>
            </InlineNotice>
          ) : null}
          <GridGate />
          <Card className="space-y-4 p-5" as="section">
            <SectionHeader title="Stake" as="h2" className="mb-0" />
            <p className="text-[13px] leading-5 text-text-secondary">
              {selected === null ? "Pick a square." : <>Square <span className="num font-semibold text-text-primary">{squareNumber(selected)}</span> selected.</>} Win and you get your {symbol} back plus a share of the losing coins. 10% of losing coins is burned.
            </p>
            <div>
              <label htmlFor="stake-amount" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Amount ({symbol})</label>
              <div className="flex flex-wrap items-center gap-2">
                <Input id="stake-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="num w-28" aria-invalid={problem !== null} aria-describedby="stake-problem" />
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setAmountText(p)} className={cn("num h-9 rounded-lg border px-3 text-[13px] font-semibold", amountText === p ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary hover:border-border-strong")}>
                    {p}
                  </button>
                ))}
              </div>
              <p id="stake-problem" className={cn("mt-1.5 min-h-5 text-[12px]", problem ? "text-warning" : "text-text-muted")}>
                {problem ?? (coin.data !== null ? `You have ${formatUnits(coin.data, decimals)} ${symbol}.` : "")}
              </p>
            </div>
            {estimate && selected !== null && amount !== null && !problem ? (
              <p className="num text-[12px] text-text-muted">If square {squareNumber(selected)} wins now: about {formatUnits(estimate.award, decimals)} {symbol}. Others may still stake.</p>
            ) : null}
            <Button block iconLeft={<Play size={16} />} disabled={stakeDisabled} loading={busy} loadingLabel="Sending…" onClick={() => selected !== null && amount !== null && void stake(selected, amount)}>
              {stakeLabel}
            </Button>
            {!isChip && signedIn ? <p className="text-[12px] leading-5 text-text-muted">Only CHIP stakes skip popups. {symbol} stakes need your {near.method === "email" ? "approval" : "wallet"}.</p> : null}
            {notice ? (
              <InlineNotice tone={notice.tone}>
                {notice.text} {notice.url ? <ExplorerLink href={notice.url}>Transaction</ExplorerLink> : null}
              </InlineNotice>
            ) : null}
          </Card>

          {isChip ? (
            <Card className="space-y-3 p-5" as="section">
              <SectionHeader title="Auto-mine" as="h2" className="mb-0" />
              <p className="text-[13px] leading-5 text-text-secondary">Stakes the amount above on a random square each round. Works only while this page is open.</p>
              <div className="flex flex-wrap items-center gap-2">
                {autoLeft > 0 ? (
                  <Button variant="secondary" iconLeft={<Square size={15} />} onClick={() => setAutoLeft(0)}>Stop ({autoLeft} left)</Button>
                ) : (
                  <>
                    <Button variant="secondary" iconLeft={<Repeat size={15} />} disabled={!canStake || problem !== null} onClick={() => { autoRound.current = 0; setAutoLeft(autoTotal); }}>Mine {autoTotal} rounds</Button>
                    {[3, 5, 10, 30].map((n) => (
                      <button key={n} type="button" onClick={() => setAutoTotal(n)} className={cn("num h-9 rounded-lg border px-3 text-[13px] font-semibold", autoTotal === n ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary hover:border-border-strong")}>{n}</button>
                    ))}
                  </>
                )}
              </div>
            </Card>
          ) : null}

          {needsSettle && lastRound.data ? (
            <InlineNotice tone="info">
              <span className="flex flex-wrap items-center gap-3">
                {isRefundOnly(lastRound.data.id)
                  ? `Round ${lastRound.data.id} was not settled within ten minutes. Anyone can refund it: every stake goes back.`
                  : `Round ${lastRound.data.id} ended with ${formatUnits(lastRound.data.total, decimals)} ${symbol}. Anyone can settle it.`}
                <Button size="sm" variant="secondary" disabled={!signedIn} loading={busy} loadingLabel="Sending…" onClick={() => void settle(lastRound.data!.id)}>{isRefundOnly(lastRound.data.id) ? "Refund" : "Settle"} round {lastRound.data.id}</Button>
              </span>
            </InlineNotice>
          ) : null}

          {(owed.data ?? 0n) > 0n ? (
            <InlineNotice tone="info">
              <span className="flex flex-wrap items-center gap-3">{formatUnits(owed.data!, decimals)} {symbol} waiting from a failed payout. <Button size="sm" variant="secondary" loading={busy} onClick={() => void claim()}>Claim</Button></span>
            </InlineNotice>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5" as="section">
          <SectionHeader title="Last round" as="h2" icon={<Trophy size={18} />} />
          {!lastResult ? (
            <p className="text-[14px] text-text-secondary">No finished rounds.</p>
          ) : lastResult.outcome === "settled" ? (
            <div className="space-y-2">
              <p className="text-[14px] text-text-secondary">
                Round <span className="num">{lastResult.round}</span>: square <span className="num font-semibold text-text-primary">{lastResult.winning_square !== null ? squareNumber(lastResult.winning_square) : "?"}</span> won, {formatUnits(lastResult.total, decimals)} {symbol} staked, <Flame size={13} className="inline text-warning" aria-hidden="true" /> {formatUnits(lastResult.burned, decimals)} burned · {timeAgo(lastResult.settled_at, now)}
              </p>
              <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {winnersOfLast.map((w) => (
                  <li key={w.player} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span className={cn("truncate", w.player === accountId ? "font-semibold text-text-primary" : "text-text-secondary")}>{w.player === accountId ? "You" : shortAccount(w.player, 26)}</span>
                    <span className="num shrink-0 text-text-primary">{formatUnits(w.award, decimals)} {symbol}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[14px] text-text-secondary">Round <span className="num">{lastResult.round}</span> refunded: {lastResult.winning_square === null ? "nobody was on the winning square, so every stake is back" : "it was not settled in time, so every stake is back"}. {isChip ? "Stake in the first 50 seconds and the Foreman covers the empty squares, so the round has a winner." : "Cover more squares to raise your chance."} Nothing burned.</p>
          )}
        </Card>

        <Card className="p-5" as="section">
          <SectionHeader title="This mine" as="h2" />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Won rounds" value={stats.data ? String(stats.data.rounds_settled) : "…"} />
            <Stat label="Refunded" value={stats.data ? String(stats.data.rounds_refunded) : "…"} />
            <Stat label={`${symbol} burned`} value={stats.data ? formatUnits(burnedTotal(stats.data), decimals) : "…"} />
            <Stat label={`${symbol} staked`} value={stats.data ? formatUnits(stats.data.staked_total, decimals) : "…"} />
          </div>
          <p className="mt-3 text-[12px] leading-5 text-text-muted">
            {isChip
              ? "Totals include the Foreman, Kova's own account: in any round a player joins, it puts 1 CHIP on every empty square so the round has a winner. Its stakes and burns are ours, not player activity."
              : `The Foreman does not play ${symbol}. If nobody is on the winning square, every stake is returned and nothing burns.`}
          </p>
          <p className="mt-3 text-[12px] leading-5 text-text-muted">Stake limit: {formatUnits(minStake, decimals)} to {formatUnits(maxStake, decimals)} {symbol} per player per round.</p>
        </Card>
      </div>

      <Card className="p-5" as="section">
        <SectionHeader title="Recent rounds" as="h2" />
        {recent.data && recent.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <thead className="text-text-muted">
                <tr><th className="pb-2 font-medium">Round</th><th className="pb-2 font-medium">Result</th><th className="pb-2 text-right font-medium">Staked</th><th className="pb-2 text-right font-medium">Burned</th><th className="pb-2 text-right font-medium">Players</th></tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {recent.data.map((r) => {
                  const won = r.winners.find((w) => w.player === accountId);
                  return (
                    <tr key={r.round}>
                      <td className="num py-2 text-text-secondary">{r.round}</td>
                      <td className="py-2 text-text-primary">{r.outcome === "settled" ? `Square ${r.winning_square !== null ? squareNumber(r.winning_square) : "?"}` : "Refunded"}{won ? <span className="ml-2 font-semibold text-success">you won {formatUnits(won.award, decimals)}</span> : null}</td>
                      <td className="num py-2 text-right text-text-secondary">{formatUnits(r.total, decimals)}</td>
                      <td className="num py-2 text-right text-text-secondary">{formatUnits(r.burned, decimals)}</td>
                      <td className="num py-2 text-right text-text-secondary">{r.players}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[14px] text-text-secondary">{recent.data ? "No finished rounds yet." : "Loading…"}</p>
        )}
        <p className="mt-3 text-[12px] text-text-muted">Last 24 rounds shown.</p>
      </Card>
      {showBar ? (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border-subtle bg-bg/95 p-3 backdrop-blur-md lg:hidden">
          <Button block iconLeft={<Play size={16} />} disabled={stakeDisabled} loading={busy} loadingLabel="Sending…" onClick={() => selected !== null && amount !== null && void stake(selected, amount)}>
            {stakeLabel}
          </Button>
          {problem ? <p className="mt-1.5 text-center text-[12px] text-warning">{problem}</p> : null}
        </div>
      ) : null}
    </Page>
  );
}
