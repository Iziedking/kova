"use client";

/**
 * /tables: where a player finds a table. Their own tables first, then tables waiting for a player,
 * then the latest results. Every row opens the table's own page.
 */
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type ChipTable, formatChip } from "@/adapters/near/chip";
import { displayAccount } from "@/adapters/near/leaderboard";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { HOUSE_ACCOUNT } from "./near-session";
import { NEAR_PLAY_PATH, tablePath } from "./paths";
import { usePendingPickRecovery } from "./seat-actions";
import { useNow } from "./use-now";
import { usePlayer } from "./use-player";
import { usePoll } from "./use-poll";

const FINAL = new Set(["Settled", "Cancelled", "Voided"]);

function who(t: ChipTable, viewer: string | null) {
  return t.players.map((p) => (p.player === HOUSE_ACCOUNT ? "the House" : p.player === viewer ? "you" : displayAccount(p.player))).join(", ");
}

function status(t: ChipTable, now: number) {
  if (t.status === "Open") return t.open_until > now ? { live: true, label: `${t.players.length} of ${t.seats} seated` } : { live: false, label: "Not filled" };
  if (t.status === "Locked") return { live: true, label: "Starting" };
  if (t.status === "Active") return now < t.ends_at ? { live: true, label: "Round running" } : { live: true, label: "Settling" };
  if (t.status === "Settled") return { live: false, label: "Settled" };
  return { live: false, label: "Refunded" };
}

function Row({ t, viewer, now, action }: { t: ChipTable; viewer: string | null; now: number; action: string }) {
  const s = status(t, now);
  return (
    <li>
      <Link href={tablePath(t.id)} className="group flex items-center justify-between gap-3 py-3">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text-primary">
            Table {t.id}
            <span className="num font-normal text-text-secondary">
              {formatChip(t.stake)} CHIP · {t.round_seconds} s
            </span>
            {s.live ? <LiveBadge label={s.label} /> : <Badge tone={t.status === "Settled" ? "success" : "neutral"}>{s.label}</Badge>}
          </span>
          <span className="block truncate text-[12px] text-text-muted">{who(t, viewer)}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[#b79bff] group-hover:text-[#d0bdff]">
          {action} <ArrowRight size={14} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function Section({ title, empty, children, count }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <Card className="p-5" as="section" aria-label={title}>
      <h2 className="font-display text-[18px] font-bold text-text-primary">{title}</h2>
      {count ? <ul className="mt-1 divide-y divide-border-subtle">{children}</ul> : <p className="mt-2 text-[13px] text-text-muted">{empty}</p>}
    </Card>
  );
}

export function TablesScreen() {
  const player = usePlayer();
  const { near, accountId } = player;
  const now = useNow();
  const tables = usePoll(() => near.chip.getTables(undefined, 30), 5_000, "tables");
  usePendingPickRecovery(accountId, tables.data ?? null);
  const all = tables.data ?? [];

  const mine = all.filter((t) => !!accountId && t.players.some((p) => p.player === accountId) && !FINAL.has(t.status));
  const waiting = all.filter((t) => t.status === "Open" && t.open_until > now && t.players.length < t.seats && !(accountId && t.players.some((p) => p.player === accountId)));
  const recent = all.filter((t) => FINAL.has(t.status)).slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 px-4 pb-16 pt-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Tables</h1>
          <p className="mt-2 text-[16px] text-text-secondary">Your tables, tables waiting for a player, and the latest results, read from the contract.</p>
        </div>
        <Button href={NEAR_PLAY_PATH}>Start a round</Button>
      </header>

      {!tables.data ? (
        <Card className="p-5">
          <p className="text-[13px] text-text-muted">{tables.error ? `Could not read tables: ${tables.error}` : "Reading tables from the contract…"}</p>
        </Card>
      ) : (
        <>
          {accountId ? (
            <Section title="Your tables" count={mine.length} empty="You are not at a table. Start a round or take a seat below.">
              {mine.map((t) => (
                <Row key={t.id} t={t} viewer={accountId} now={now} action="Open" />
              ))}
            </Section>
          ) : null}
          <Section title="Waiting for a player" count={waiting.length} empty="No table is waiting right now. Open one for friends from the play page.">
            {waiting.map((t) => (
              <Row key={t.id} t={t} viewer={accountId} now={now} action="Take a seat" />
            ))}
          </Section>
          <Section title="Latest results" count={recent.length} empty="No table has finished yet.">
            {recent.map((t) => (
              <Row key={t.id} t={t} viewer={accountId} now={now} action="See result" />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
