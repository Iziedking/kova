"use client";

import { Flame, RotateCcw, Send, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type ChipTable, failureMessage, formatChip } from "@/adapters/near/chip";
import { marketById } from "@/adapters/near/prices";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { HOUSE_ACCOUNT, nearNetwork, useNear } from "./near-session";
import { deliverPick } from "./picks";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";

type Evidence = {
  houseReason: string | null;
  marks: { player: string; phase: "start" | "end"; market: string; priceE18: string; source: string; sourceRef: string; capturedAt: string; explorerUrl: string | null }[];
};

const FINAL = new Set(["Settled", "Cancelled", "Voided"]);

function symbolOf(market: string | null) {
  if (!market) return "hidden";
  const known = marketById(market);
  if (known) return known.symbol;
  const token = market.replace(/^near:/, "");
  return token.split(".")[0].replace(/-\d+$/, "").toUpperCase();
}

function clock(seconds: number) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function stage(table: ChipTable, now: number): { label: string; detail: string; due: boolean; live: boolean } {
  switch (table.status) {
    case "Open":
      return now >= table.open_until
        ? { label: "Not filled", detail: "Nobody took the last seat. Anyone can refund this table now.", due: true, live: false }
        : { label: "Waiting for a player", detail: `Seats close in ${clock(table.open_until - now)}.`, due: false, live: true };
    case "Locked":
      return now >= table.start_deadline
        ? { label: "Settler missed the start", detail: "Anyone can refund this table now. Every stake comes back.", due: true, live: false }
        : { label: "Locking prices", detail: `The settler reveals every pick with its start price. Refundable in ${clock(table.start_deadline - now)} if it does not.`, due: false, live: true };
    case "Active":
      if (now < table.ends_at) return { label: "Round running", detail: `${clock(table.ends_at - now)} left.`, due: false, live: true };
      return now >= table.settle_deadline
        ? { label: "Settler missed the end", detail: "Anyone can refund this table now. Every stake comes back.", due: true, live: false }
        : { label: "Settling", detail: "The settler is reporting end prices.", due: false, live: true };
    case "Settled":
      return { label: "Settled", detail: "Pot burned and paid by the contract.", due: false, live: false };
    default:
      return { label: "Refunded", detail: "Every stake went back. Nothing burned.", due: false, live: false };
  }
}

export function TableView({ tableId, viewer, onLeave, onSupplyChange }: { tableId: string; viewer: string; onLeave: () => void; onSupplyChange?: () => void }) {
  const near = useNear();
  const now = useNow();
  const table = usePoll(() => near.chip.getTable(tableId), 2_000, `table:${tableId}`);
  const final = table.data ? FINAL.has(table.data.status) : false;
  const evidence = usePoll(final ? async () => (await (await fetch(`/api/near/tables/${tableId}/evidence`)).json()) as Evidence : null, 30_000, `evidence:${tableId}:${final}`);
  const supply = usePoll(final ? () => near.chip.getStats().then((s) => s.total_supply) : null, 30_000, `supply:${tableId}:${final}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "danger" | "info" | "warning"; text: string; link?: string } | null>(null);

  useEffect(() => {
    if (final) onSupplyChange?.();
  }, [final, onSupplyChange]);

  if (!table.data) {
    return (
      <Card className="p-5">
        <p className="text-[14px] text-text-secondary">{table.error ? `Could not read table ${tableId}: ${table.error}` : `Reading table ${tableId} from the contract…`}</p>
      </Card>
    );
  }

  const t = table.data;
  const s = stage(t, now);
  const mine = t.players.find((p) => p.player === viewer);
  const best = t.status === "Settled" ? Math.max(...t.players.map((p) => p.score_bps ?? Number.NEGATIVE_INFINITY)) : null;
  const tie = t.status === "Settled" && t.players.filter((p) => p.score_bps === best).length > 1;
  const won = t.status === "Settled" && mine ? mine.award > 0n && !tie : false;
  const headline = t.status !== "Settled" ? s.label : tie ? (mine && mine.award > 0n ? "Tie. The pot was split." : "Tie") : won ? "You won the pot" : mine ? "The House took it" : "Settled";
  // A tie at 0 means no picked coin traded during the round, which is common for thin memecoin pools.
  const detail = t.status === "Settled" && tie && best === 0 ? "No picked coin traded during the round, so every score was 0. The pot burned and the rest was split." : s.detail;
  const settleTx = evidence.data?.marks.find((m) => m.phase === "end")?.explorerUrl ?? null;

  async function refund() {
    setBusy("void");
    const result = await near.call("void_table", { table_id: tableId });
    setBusy(null);
    setNote(result.success ? { tone: "info", text: "Refunded. Every stake is back.", link: result.explorerUrl } : { tone: "danger", text: failureMessage(result.failure), link: result.explorerUrl });
    void table.refresh();
  }

  async function resend() {
    setBusy("pick");
    const result = await deliverPick(tableId, viewer);
    setBusy(null);
    setNote(result.ok ? { tone: "info", text: "Pick delivered to the settler." } : { tone: "danger", text: result.message ?? "Could not send the pick." });
  }

  return (
    <Card className="kova-edge overflow-hidden p-0" as="section">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-text-primary">Table {t.id}</p>
          <Badge tone="outline">{formatChip(t.stake)} CHIP each</Badge>
          {s.live ? <LiveBadge label={s.label} /> : <Badge tone={t.status === "Settled" ? "success" : "neutral"}>{s.label}</Badge>}
        </div>
        <button type="button" onClick={onLeave} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] text-text-secondary hover:text-text-primary" aria-label="Close this table view">
          <X size={16} aria-hidden="true" /> Close
        </button>
      </div>

      <div className="px-5 py-5">
        <h2 className={cn("font-display text-[24px] font-bold", won ? "text-success" : "text-text-primary")}>
          {won ? <Trophy size={20} className="mr-2 inline align-[-2px]" aria-hidden="true" /> : null}
          {headline}
        </h2>
        <p className="mt-1 text-[14px] text-text-secondary">{detail}</p>

        {t.status === "Settled" ? (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
              <Flame size={16} className="text-danger" aria-hidden="true" />
              This pot burned <span className="num text-danger">{formatChip(t.burned)} CHIP</span>.
            </p>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              Supply is now <span className="num font-semibold text-text-primary">{supply.data !== null ? formatChip(supply.data) : "…"}</span> CHIP
              {settleTx ? (
                <>
                  {" "}·{" "}
                  <a className="underline" href={settleTx} target="_blank" rel="noreferrer">
                    the settlement on chain
                  </a>
                </>
              ) : null}
            </p>
          </div>
        ) : null}

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {t.players.map((p) => {
            const isHouse = p.player === HOUSE_ACCOUNT;
            const isViewer = p.player === viewer;
            const winner = t.status === "Settled" && p.award > 0n;
            return (
              <li key={p.player} className={cn("rounded-xl border p-4", winner ? "border-success/40 bg-success-soft" : "border-border-subtle bg-surface-2")}>
                <div className="flex items-center justify-between gap-2">
                  <a className="truncate text-[14px] font-semibold text-text-primary hover:underline" href={nearNetwork.explorerAccount(p.player)} target="_blank" rel="noreferrer">
                    {isViewer ? `You (${p.player})` : isHouse ? "The House" : p.player}
                  </a>
                  {winner ? <Badge tone="success">{tie ? "Split" : "Won"}</Badge> : t.status === "Settled" ? <Badge>Lost</Badge> : null}
                </div>
                <p className="num mt-2 text-[20px] font-bold text-text-primary">{symbolOf(p.market)}</p>
                <p className="num text-[12px] text-text-muted">
                  {p.score_bps !== null ? `${p.score_bps >= 0 ? "+" : ""}${(p.score_bps / 100).toFixed(2)}% over the round` : p.market ? "Pick revealed" : "Pick sealed until the round starts"}
                </p>
                {t.status === "Settled" ? <p className="num mt-1 text-[13px] text-text-secondary">{p.award > 0n ? `+${formatChip(p.award)} CHIP` : `-${formatChip(t.stake)} CHIP`}</p> : null}
              </li>
            );
          })}
          {t.status === "Open"
            ? Array.from({ length: t.seats - t.players.length }, (_, i) => (
                <li key={`empty-${i}`} className="flex min-h-[112px] items-center justify-center rounded-xl border border-dashed border-border-strong text-[13px] text-text-muted">
                  Empty seat
                </li>
              ))
            : null}
        </ul>

        {evidence.data?.houseReason ? (
          <p className="mt-4 text-[13px] text-text-secondary">
            <span className="font-semibold text-text-primary">The House&apos;s reason:</span> {evidence.data.houseReason}
          </p>
        ) : null}
        {t.status === "Settled" || t.status === "Active" ? (
          <p className="mt-2 text-[11px] text-text-muted">Prices reported by Kova&apos;s settler from mainnet DEX Screener data. The settler can decide a table; it cannot touch the treasury, change the rules or block refunds.</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {s.due ? (
            <Button iconLeft={<RotateCcw size={16} />} onClick={() => void refund()} loading={busy === "void"} loadingLabel="Refunding…">
              Refund this table
            </Button>
          ) : null}
          {mine && (t.status === "Open" || t.status === "Locked") && !s.due ? (
            <Button variant="ghost" size="sm" iconLeft={<Send size={14} />} onClick={() => void resend()} loading={busy === "pick"}>
              Send my pick again
            </Button>
          ) : null}
          {final ? (
            <Button variant="secondary" onClick={onLeave}>
              Play again
            </Button>
          ) : null}
        </div>
        {note ? (
          <InlineNotice tone={note.tone} className="mt-3">
            {note.text}{" "}
            {note.link ? (
              <a className="underline" href={note.link} target="_blank" rel="noreferrer">
                View transaction
              </a>
            ) : null}
          </InlineNotice>
        ) : null}
        {table.stale ? <p className="mt-2 text-[12px] text-warning">Lost contact with the RPC. Showing the last read.</p> : null}
      </div>
    </Card>
  );
}
