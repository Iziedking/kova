"use client";

import { Crown, Sparkles } from "lucide-react";
import { useState } from "react";
import { failureMessage, formatChip } from "@/adapters/near/chip";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/states";
import { useNear } from "./near-session";
import { usePoll } from "./use-poll";

type Pending = { day: number; closed: boolean; targetMet: boolean; claimable: bigint; claimed: boolean; topClan: boolean; clan: string | null };

/**
 * The player's side of the daily call for the last three finished days: close a day that is still
 * open (anyone may), then claim the share it minted. Members of the day's top clan claim more.
 */
export function DailyClaim({ today, launchDay }: { today: number; launchDay: number }) {
  const near = useNear();
  const { chip, accountId } = near;
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "danger" | "info"; text: string; link?: string } | null>(null);
  const pending = usePoll(
    accountId
      ? async () => {
          const days = [today - 1, today - 2, today - 3].filter((d) => d >= launchDay);
          const rows = await Promise.all(
            days.map(async (day): Promise<Pending | null> => {
              const [claim, state] = await Promise.all([chip.getDailyClaim(day, accountId), chip.getDay(day)]);
              if (!claim.played) return null;
              return { day, closed: state.closed, targetMet: state.target_met, claimable: claim.claimable, claimed: claim.claimed, topClan: !!claim.top_clan, clan: claim.clan ?? null };
            }),
          );
          return rows.filter((r): r is Pending => r !== null && (!r.closed || (r.targetMet && !r.claimed)));
        }
      : null,
    30_000,
    `daily-claim:${accountId}:${today}`,
  );

  async function act(method: "close_day" | "claim_daily", day: number) {
    setBusy(`${method}:${day}`);
    setNote(null);
    const result = await near.call<string>(method, { day });
    setBusy(null);
    if (!result.success) setNote({ tone: "danger", text: failureMessage(result.failure), link: result.explorerUrl });
    else if (method === "claim_daily") setNote({ tone: "info", text: `Claimed ${formatChip(BigInt(String(result.value ?? "0")))} CHIP for day ${day}.`, link: result.explorerUrl });
    else setNote({ tone: "info", text: `Day ${day} is closed.`, link: result.explorerUrl });
    void pending.refresh();
  }

  const rows = pending.data ?? [];
  if (!accountId || (!rows.length && !note)) return null;
  return (
    <div className="mt-4 space-y-2 border-t border-border-subtle pt-3">
      {rows.map((r) =>
        !r.closed ? (
          <div key={r.day} className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-text-secondary">You played on day {r.day}. It has not been closed yet.</p>
            <Button size="sm" variant="secondary" loading={busy === `close_day:${r.day}`} loadingLabel="Closing…" onClick={() => void act("close_day", r.day)}>
              Close day {r.day}
            </Button>
          </div>
        ) : (
          <div key={r.day} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2">
            <p className="flex items-center gap-1.5 text-[13px] text-text-primary">
              {r.topClan ? <Crown size={14} className="text-warning" aria-hidden="true" /> : <Sparkles size={14} className="text-success" aria-hidden="true" />}
              Day {r.day} met its target{r.topClan && r.clan ? `, and ${r.clan} led the clan race` : ""}.
            </p>
            <Button size="sm" loading={busy === `claim_daily:${r.day}`} loadingLabel="Claiming…" onClick={() => void act("claim_daily", r.day)}>
              Claim {formatChip(r.claimable)} CHIP
            </Button>
          </div>
        ),
      )}
      {note ? (
        <InlineNotice tone={note.tone}>
          {note.text}{" "}
          {note.link ? (
            <a className="underline" href={note.link} target="_blank" rel="noreferrer">
              View transaction
            </a>
          ) : null}
        </InlineNotice>
      ) : null}
    </div>
  );
}
