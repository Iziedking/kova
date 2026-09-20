"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { formatAnsemRaw, formatDurationShort } from "@/lib/format";
import { useViewer } from "@/features/auth/viewer";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { useResource } from "@/hooks/use-resource";
import { CompetitionTimer } from "@/components/play/competition-timer";
import { PlayerSeat } from "@/components/play/player-seat";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import { loadServices } from "@/services";
import type { TableDetail } from "@/types/competition";
import { LockPickPanel } from "@/features/prediction/lock-pick-panel";
import { marketRuleLabel } from "./table-options";
import { TableHeader } from "./table-header";

interface Props {
  table: TableDetail;
  readAt: number;
  onChanged: () => void;
}

function RulesList({ table }: { table: TableDetail }) {
  const rows: Array<[string, string]> = [
    ["Mode", table.mode === "prediction" ? "Predict · secret pick" : "Trade · real trades"],
    ["Stake", formatAnsemRaw(table.stakeAnsemRaw) + " each"],
    ["Match length", formatDurationShort(table.durationSeconds)],
    ["Players", `${table.filledSeats}/${table.maxPlayers}`],
    ["Market", table.marketLabel ?? marketRuleLabel("any")],
    ["Winner", table.mode === "prediction" ? "Best % move of the pick" : "Highest net PnL %"],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 border-b border-border-subtle pb-2.5 sm:block sm:border-0 sm:pb-0">
          <dt className="text-[13px] text-text-secondary">{label}</dt>
          <dd className="num text-[14px] font-medium text-text-primary sm:mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Waiting room (blueprint 11): rules, seats, invite, and the one action that fits
 * the viewer - Join, Ready or Start. Staking is a wallet action, so Join asks for
 * a wallet at the moment it is needed. Each action reports what the backend says,
 * including that a capability is not live yet.
 */
export function WaitingRoom({ table, readAt, onChanged }: Props) {
  const viewer = useViewer();
  const shell = useShell();
  const requireAuth = useRequireAuth();
  const [busy, setBusy] = useState<"join" | "ready" | "start" | "invite" | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "warning" | "danger" } | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const caps = useResource((s) => s.competitions.capabilities(), []);
  const escrow = caps.state.status === "ready" ? caps.state.data.find((entry) => entry.key === "ansemEscrow") : null;
  const stakingLive = escrow ? escrow.state === "live" : true;

  const isOwner = table.viewerState === "owner";
  const joined = table.viewerState === "joined" || isOwner;
  const seatsFree = table.filledSeats < table.maxPlayers;
  const allFunded = table.seats.filter((seat) => seat.player).every((seat) => seat.readiness === "funded" || seat.readiness === "locked" || seat.readiness === "ready");
  const canStart = isOwner && table.filledSeats >= 2 && allFunded;

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<{ ok: boolean; error?: { message: string; code: string } }>, success?: string) {
    setBusy(kind);
    setNotice(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setNotice({ message: result.error?.message ?? "That didn't work.", tone: result.error?.code === "PENDING_INTEGRATION" ? "warning" : "danger" });
      return false;
    }
    if (success) toast.success(success);
    onChanged();
    return true;
  }

  const ctx = { getAccessToken: viewer.getAccessToken };

  function join() {
    requireAuth(
      () =>
        shell.requireWallet("Staking ANSEM needs a Solana wallet. Your stake is the only thing that moves.", () => {
          void loadServices().then((s) => run("join", () => s.competitions.joinTable(table.id, ctx), "You're in. Good luck."));
        }),
      { next: `/tables/${encodeURIComponent(table.id)}?intent=join` },
    );
  }

  async function invite() {
    setBusy("invite");
    setNotice(null);
    const s = await loadServices();
    const result = await s.competitions.createInvitation(table.id, ctx);
    setBusy(null);
    if (!result.ok) {
      setNotice({ message: result.error.message, tone: result.error.code === "PENDING_INTEGRATION" ? "warning" : "danger" });
      return;
    }
    setInviteUrl(`${window.location.origin}/tables/${encodeURIComponent(table.id)}?invite=${encodeURIComponent(result.data.token)}`);
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-8">
      <TableHeader table={table} readAt={readAt} showTimer={false} />

      {!stakingLive ? (
        <InlineNotice tone="warning">
          ANSEM staking isn&apos;t live yet ({escrow?.state.replace(/_/g, " ")}). You can browse this table, but seats can&apos;t be funded until escrow is enabled.
        </InlineNotice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="rules-title" className="rounded-panel border border-border-subtle bg-surface-1 p-5">
            <h2 id="rules-title" className="mb-4 font-display text-[18px] font-bold text-text-primary">Rules</h2>
            <RulesList table={table} />
          </section>

          <section aria-labelledby="seats-title">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="seats-title" className="font-display text-[18px] font-bold text-text-primary">Players</h2>
              <span className="num text-[13px] text-text-secondary">{table.filledSeats}/{table.maxPlayers} seated</span>
            </div>
            <ul className="grid gap-2.5 md:grid-cols-2">
              {table.seats.map((seat) => (
                <PlayerSeat key={seat.seat} seat={seat} mode={table.mode} />
              ))}
            </ul>
            {table.maxPlayers > table.seats.length ? (
              <p className="mt-2 text-[12px] text-text-muted">+{table.maxPlayers - table.seats.length} more seats</p>
            ) : null}
          </section>

          {table.mode === "prediction" && joined ? <LockPickPanel table={table} onLocked={onChanged} /> : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Table actions">
          <div className="rounded-panel border border-border-subtle bg-surface-1 p-5">
            <h2 className="font-display text-[18px] font-bold text-text-primary">
              {isOwner ? "You're hosting" : joined ? "You're seated" : "Take a seat"}
            </h2>
            <p className="mt-1 text-[14px] text-text-secondary">
              {joined
                ? table.mode === "prediction"
                  ? "Lock your pick, then wait for the table to fill."
                  : "Fund your competition account, then mark yourself ready."
                : `Stake ${formatAnsemRaw(table.stakeAnsemRaw)} to play. The winner takes the pot.`}
            </p>

            {table.opensUntil ? (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-text-secondary">
                Table closes to new players in
                <CompetitionTimer endsAt={table.opensUntil} serverTime={table.serverTime} readAt={readAt} format="clock" showIcon={false} />
              </div>
            ) : null}

            {notice ? <InlineNotice tone={notice.tone} className="mt-3">{notice.message}</InlineNotice> : null}

            <div className="mt-4 space-y-2.5">
              {!joined ? (
                <Button block size="lg" onClick={join} loading={busy === "join"} loadingLabel="Joining…" disabled={!seatsFree || table.status !== "open"}>
                  {seatsFree ? `Join table · ${formatAnsemRaw(table.stakeAnsemRaw)}` : "Table is full"}
                </Button>
              ) : isOwner ? (
                <Button
                  block
                  size="lg"
                  disabled={!canStart}
                  loading={busy === "start"}
                  loadingLabel="Starting…"
                  onClick={() => void loadServices().then((s) => run("start", () => s.competitions.startMatch(table.id, ctx), "Match started"))}
                >
                  Start match
                </Button>
              ) : (
                <Button
                  block
                  size="lg"
                  loading={busy === "ready"}
                  loadingLabel="Marking ready…"
                  onClick={() => void loadServices().then((s) => run("ready", () => s.competitions.setReady(table.id, ctx), "You're ready"))}
                >
                  Ready
                </Button>
              )}
              {isOwner && !canStart ? (
                <p className="text-[12px] text-text-muted">Start unlocks when at least two funded players are seated.</p>
              ) : null}
            </div>
          </div>

          {joined || table.visibility === "public" ? (
            <div className="rounded-panel border border-border-subtle bg-surface-1 p-5">
              <h2 className="font-display text-[18px] font-bold text-text-primary">Invite players</h2>
              <p className="mt-1 text-[14px] text-text-secondary">Share a link to this table.</p>
              {inviteUrl ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    aria-label="Invite link"
                    value={inviteUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className="num h-11 min-w-0 flex-1 truncate rounded-input border border-border-strong bg-surface-2 px-3 text-[12px] text-text-secondary outline-none focus:border-accent"
                  />
                  <Button variant="secondary" onClick={() => void copyInvite()} aria-label="Copy invite link" iconLeft={copied ? <Check size={16} /> : <Copy size={16} />}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-3"
                  variant="secondary"
                  iconLeft={<Link2 size={16} />}
                  loading={busy === "invite"}
                  loadingLabel="Creating link…"
                  onClick={() => requireAuth(() => void invite(), { next: `/tables/${encodeURIComponent(table.id)}` })}
                >
                  Create invite link
                </Button>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
