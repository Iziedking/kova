"use client";

/**
 * /t/<id>: one table. A visitor with a free seat sees the invite and joins with a pick; everyone else
 * (seated players, watchers, the result) sees the live table. This is also the challenge link.
 */
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatChip } from "@/adapters/near/chip";
import { displayAccount } from "@/adapters/near/leaderboard";
import { parseCall } from "@/adapters/near/launch-calls";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { MarketPicker, usePickOptions } from "./market-picker";
import { HOUSE_ACCOUNT } from "./near-session";
import { NEAR_PLAY_PATH, NEAR_TABLES_PATH } from "./paths";
import { ReadyGate } from "./ready-gate";
import { type SeatOutcome, takeSeat } from "./seat-actions";
import { TableView } from "./table-view";
import { usePlayer } from "./use-player";
import { usePoll } from "./use-poll";

function clock(seconds: number) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function TableScreen({ tableId }: { tableId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const player = usePlayer();
  const { near, accountId } = player;
  const table = usePoll(() => near.chip.getTable(tableId), 3_000, `table-page:${tableId}`);
  const t = table.data ?? null;
  const { markets, callable, now } = usePickOptions(t?.round_seconds ?? null);
  const [market, setMarket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<SeatOutcome | null>(null);
  const note = params.get("note");

  const seated = !!t && !!accountId && t.players.some((p) => p.player === accountId);
  const joinable = !!t && !seated && t.status === "Open" && t.open_until > now && t.players.length < t.seats;

  const pickedCall = parseCall(market);
  const chosen = pickedCall && !callable.some((a) => a.id === pickedCall.memeId) ? null : (market ?? markets.data?.find((m) => m.available)?.id ?? null);
  const enough = !!t && player.balance !== null && player.balance >= t.stake;

  async function join() {
    if (!accountId || !chosen || !t) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await takeSeat(near, accountId, t.id, chosen);
      setMessage(outcome.text ? outcome : null);
      await table.refresh();
    } finally {
      setBusy(false);
      void player.refresh();
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 pb-16 pt-6 md:px-8">
      <Link href={NEAR_TABLES_PATH} className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary">
        <ArrowLeft size={14} aria-hidden="true" /> All tables
      </Link>

      {!t ? (
        <Card className="p-6">
          <h1 className="font-display text-[28px] font-bold text-text-primary">Table {tableId}</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            {table.error ? `Could not read table ${tableId}: ${table.error}` : table.updatedAt ? `There is no table ${tableId}. Check the link, or start a round.` : `Reading table ${tableId} from the contract…`}
          </p>
          {table.updatedAt && !table.error ? (
            <Button className="mt-4" href={NEAR_PLAY_PATH}>
              Play a round
            </Button>
          ) : null}
        </Card>
      ) : joinable ? (
        <>
          <header>
            <h1 className="font-display text-[32px] font-bold leading-tight text-text-primary md:text-[38px]">Join table {t.id}</h1>
            <p className="mt-2 text-[15px] text-text-secondary">
              {t.host === HOUSE_ACCOUNT ? "The House" : displayAccount(t.host)} saved a seat. Pick the coin you think rises most; the best move takes the pot, and 10% of it burns.
            </p>
          </header>

          <Card className="kova-edge p-5" as="section" aria-label={`Table ${t.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="num text-[16px] font-semibold text-text-primary">
                {formatChip(t.stake)} CHIP each · {t.round_seconds} s round
              </p>
              <LiveBadge label={`Seats close in ${clock(t.open_until - now)}`} />
            </div>
            <p className="mt-1 text-[13px] text-text-secondary">
              {t.players.length} of {t.seats} seated: {t.players.map((p) => (p.player === HOUSE_ACCOUNT ? "the House" : displayAccount(p.player))).join(", ")}
            </p>
          </Card>

          <ReadyGate purpose="take this seat" />

          <Card className="space-y-5 p-5 md:p-6" as="section" aria-label="Your pick">
            <fieldset disabled={player.step !== "ready" || busy}>
              <p className="mb-2 text-[12px] font-medium text-text-secondary">Your pick. It stays sealed until the round starts.</p>
              <MarketPicker value={chosen} onChange={setMarket} markets={markets.data ?? null} callable={callable} now={now} />
            </fieldset>
            <Button size="lg" iconLeft={<Users size={18} />} disabled={player.step !== "ready" || !chosen || !enough || busy} loading={busy} loadingLabel="Taking your seat…" onClick={() => void join()}>
              Join table {t.id} for {formatChip(t.stake)} CHIP
            </Button>
            {player.step === "ready" && !enough && player.balance !== null ? <p className="text-[12px] text-warning">You have {formatChip(player.balance)} CHIP, less than this table&apos;s stake.</p> : null}
            {message?.text ? <InlineNotice tone={message.tone}>{message.text}</InlineNotice> : null}
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[28px] font-bold text-text-primary">Table {t.id}</h1>
            {seated ? <Badge tone="outline">Your seat</Badge> : <Badge tone="neutral">Watching</Badge>}
          </div>
          {note ? <InlineNotice tone="warning">{note}</InlineNotice> : null}
          {message?.text ? <InlineNotice tone={message.tone}>{message.text}</InlineNotice> : null}
          <TableView tableId={t.id} viewer={accountId ?? ""} onLeave={() => router.push(NEAR_TABLES_PATH)} onPlayAgain={() => router.push(NEAR_PLAY_PATH)} />
        </>
      )}
    </div>
  );
}
