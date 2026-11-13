"use client";

import { Crown, Flag, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { failureMessage, formatChip } from "@/adapters/near/chip";
import { displayAccount } from "@/adapters/near/leaderboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { ClanLaunches } from "./clan-launches";
import { ClanRace } from "./clan-race";
import { clanInvitePost, clanPath, clanUrl, readClanRace } from "./clans";
import { nearNetwork, useNear } from "./near-session";
import { NEAR_PLAY_PATH } from "./paths";
import { SignInChoice } from "./sign-in-choice";
import { LinkActions } from "./share-table";
import { usePoll } from "./use-poll";

/** A clan's page: who is in it, how it stands today, and a join button for a signed-in visitor. */
export function ClanScreen({ name }: { name: string }) {
  const near = useNear();
  const { chip, accountId } = near;
  const clan = usePoll(() => chip.getClan(name), 10_000, `clan:${name}`);
  const config = usePoll(() => chip.getConfig(), 300_000, "config");
  const stats = usePoll(() => chip.getStats(), 15_000, "stats");
  const today = stats.data?.today ?? null;
  const day = usePoll(today !== null ? () => chip.getDay(today) : null, 15_000, `day:${today}`);
  const race = usePoll(today !== null && day.data ? () => readClanRace(chip, today, day.data?.top_clan) : null, 20_000, `race:${today}:${day.data?.top_clan ?? ""}`);
  const mine = usePoll(accountId ? () => chip.getAccountClan(accountId) : null, 10_000, `my-clan:${accountId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "danger" | "info"; text: string; link?: string } | null>(null);

  const c = clan.data;
  const standing = race.data?.find((r) => r.name === name) ?? null;
  const clans = race.data?.length ?? 0;
  const myClan = mine.data ?? null;
  const full = !!c && config.data?.clan_max_members !== undefined && c.members.length >= config.data.clan_max_members;
  const weight = config.data?.clan_top_weight ?? 2;

  async function act(method: "join_clan" | "leave_clan") {
    setBusy(method);
    setNote(null);
    const result = await near.call(method, method === "join_clan" ? { name } : {});
    setBusy(null);
    setNote(result.success ? { tone: "info", text: method === "join_clan" ? `You joined ${name}. Every table you play today counts for it.` : `You left ${name}.`, link: result.explorerUrl } : { tone: "danger", text: failureMessage(result.failure), link: result.explorerUrl });
    void mine.refresh();
    void clan.refresh();
  }

  if (!c) {
    return (
      <div className="mx-auto w-full max-w-[var(--container-app)] px-4 pb-16 pt-8 md:px-8">
        <Card className="p-6">
          <p className="text-[15px] text-text-secondary">
            {clan.error ? `Could not read clan ${name}: ${clan.error}` : clan.updatedAt ? `There is no clan called ${name}.` : `Reading clan ${name} from the contract…`}
          </p>
          {clan.updatedAt && !clan.error ? (
            <Button className="mt-4" href={NEAR_PLAY_PATH} variant="secondary">
              Found it on the play page
            </Button>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[var(--container-app)] px-4 pb-16 pt-8 md:px-8">
      <div className="mb-6">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          <Flag size={14} aria-hidden="true" /> Clan
        </p>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[44px]">
          {c.name}
          {standing?.top && standing.tables > 0 ? (
            <Badge tone="warning" icon={<Crown size={12} />}>
              Leading today
            </Badge>
          ) : null}
        </h1>
        <p className="mt-2 max-w-[640px] text-[16px] text-text-secondary">
          Founded by {displayAccount(c.founder)} · {c.members.length}
          {config.data?.clan_max_members ? ` of ${config.data.clan_max_members}` : ""} members. Every table a member plays counts for the clan; if today meets its target, the leading clan&apos;s players claim {weight} shares of the daily mint.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="space-y-5">
          <Card className="p-5" as="section">
            <h2 className="text-[14px] font-semibold text-text-primary">Today</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-3">
                <p className="text-[12px] text-text-muted">Settled tables</p>
                <p className="num mt-1 text-[22px] font-bold text-text-primary">{standing ? standing.tables : "…"}</p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-3">
                <p className="text-[12px] text-text-muted">Members played</p>
                <p className="num mt-1 text-[22px] font-bold text-text-primary">{standing ? standing.players : "…"}</p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-2 p-3">
                <p className="text-[12px] text-text-muted">Place</p>
                <p className="num mt-1 text-[22px] font-bold text-text-primary">{standing ? (standing.tables > 0 ? `${standing.rank} of ${clans}` : "–") : "…"}</p>
              </div>
            </div>
            {stats.data ? (
              <p className="num mt-3 text-[12px] text-text-muted">
                Today&apos;s call: {stats.data.today_settled_tables} of {stats.data.daily_target_tables} tables{config.data ? ` · daily mint ${formatChip(config.data.daily_mint, 0)} CHIP` : ""}
              </p>
            ) : null}
          </Card>

          <Card className="p-5" as="section">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
              <Users size={15} aria-hidden="true" /> Members
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {c.members.map((m) => (
                <li key={m} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2">
                  <a className="truncate text-[14px] font-medium text-text-primary hover:underline" href={nearNetwork.explorerAccount(m)} target="_blank" rel="noreferrer" title={m}>
                    {m === accountId ? `You (${displayAccount(m)})` : displayAccount(m)}
                  </a>
                  {m === c.founder ? <Badge tone="outline">Founder</Badge> : null}
                </li>
              ))}
            </ul>
            {c.members.length === 0 ? <p className="mt-2 text-[13px] text-text-muted">Everyone left. Anyone can join and bring it back.</p> : null}
          </Card>

          <ClanLaunches members={c.members} />
        </div>

        <aside className="space-y-5">
          <Card className="p-5" as="section">
            {near.status !== "signed_in" ? (
              <>
                <p className="text-[14px] font-semibold text-text-primary">Join {c.name}</p>
                <p className="mt-1 text-[13px] text-text-secondary">Sign in with a NEAR testnet wallet or your email, then join with one tap.</p>
                <div className="mt-3">
                  <SignInChoice compact />
                </div>
              </>
            ) : myClan === name ? (
              <>
                <p className="text-[14px] font-semibold text-text-primary">You are in {c.name}</p>
                <p className="mt-1 text-[13px] text-text-secondary">Play a table and it counts for the clan today.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button href={NEAR_PLAY_PATH}>Play a table</Button>
                  <Button variant="ghost" iconLeft={<LogOut size={16} />} onClick={() => void act("leave_clan")} loading={busy === "leave_clan"} loadingLabel="Leaving…">
                    Leave
                  </Button>
                </div>
              </>
            ) : myClan ? (
              <>
                <p className="text-[14px] font-semibold text-text-primary">You are in {myClan}</p>
                <p className="mt-1 text-[13px] text-text-secondary">An account is in one clan at a time. Leave {myClan} on its page to join {c.name}.</p>
                <Button className="mt-3" variant="secondary" href={clanPath(myClan)}>
                  Open {myClan}
                </Button>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold text-text-primary">Join {c.name}</p>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {near.keyState === "active" ? "No wallet popup: your game key covers it." : "Your wallet asks once. Turn on the game key on the play page to skip popups."}
                </p>
                <Button className="mt-3" iconLeft={<Flag size={16} />} disabled={full || !!busy} onClick={() => void act("join_clan")} loading={busy === "join_clan"} loadingLabel="Joining…">
                  {full ? "This clan is full" : `Join ${c.name}`}
                </Button>
                <p className="mt-2 text-[12px] text-text-muted">
                  New here? <Link className="underline" href={NEAR_PLAY_PATH}>Claim 1,000 CHIP on the play page</Link> first.
                </p>
              </>
            )}
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
          </Card>

          <Card className="p-5" as="section">
            <p className="text-[14px] font-semibold text-text-primary">Invite to {c.name}</p>
            <LinkActions link={clanUrl(c.name)} post={clanInvitePost(c.name)} label={`Invite link for clan ${c.name}`} />
          </Card>

          <Card className="p-5" as="section">
            <p className="mb-3 text-[14px] font-semibold text-text-primary">Today&apos;s clan race</p>
            <ClanRace limit={8} viewerClan={c.name} weight={weight} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
