"use client";

import { Flag, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { failureMessage, formatChip, isClanName } from "@/adapters/near/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { ClanRace } from "./clan-race";
import { clanInvitePost, clanPath, clanUrl } from "./clans";
import { useNear } from "./near-session";
import { LinkActions } from "./share-table";
import { usePoll } from "./use-poll";

/** The player's clan, or founding one, beside today's clan race. */
export function ClanCard() {
  const near = useNear();
  const { chip, accountId } = near;
  const config = usePoll(() => chip.getConfig(), 300_000, "config");
  const mine = usePoll(accountId ? () => chip.getAccountClan(accountId) : null, 15_000, `my-clan:${accountId}`);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "danger" | "info"; text: string; link?: string } | null>(null);

  const burn = config.data?.clan_create_burn;
  if (config.data && burn === undefined) return null; // A contract without clans.
  const clan = mine.data ?? null;
  const valid = isClanName(name);

  async function found() {
    setBusy(true);
    setNote(null);
    const result = await near.call("create_clan", { name });
    setBusy(false);
    setNote(result.success ? { tone: "info", text: `Clan ${name} founded. Send its link to your friends.`, link: result.explorerUrl } : { tone: "danger", text: failureMessage(result.failure), link: result.explorerUrl });
    if (result.success) setName("");
    void mine.refresh();
  }

  return (
    <Card className="p-5" as="section">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-primary">
          <Flag size={15} aria-hidden="true" /> Clan race
        </h2>
        {clan ? (
          <Link href={clanPath(clan)} className="text-[13px] font-medium text-[#b79bff] hover:text-[#d0bdff]">
            Your clan: {clan}
          </Link>
        ) : null}
      </div>

      <div className="mt-3">
        <ClanRace limit={5} viewerClan={clan} weight={config.data?.clan_top_weight} />
      </div>

      {near.status !== "signed_in" ? (
        <p className="mt-3 text-[12px] text-text-muted">Sign in to found or join a clan.</p>
      ) : clan ? (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
            <Users size={14} aria-hidden="true" /> Bring your clan to the table
          </p>
          <LinkActions link={clanUrl(clan)} post={clanInvitePost(clan)} label={`Invite link for clan ${clan}`} />
        </div>
      ) : (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <Input
            label="Found a clan"
            placeholder="e.g. lagos-sharks"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().trim())}
            maxLength={24}
            hint={burn !== undefined ? `3 to 24 characters: a-z, 0-9 and -. Founding burns ${formatChip(burn)} CHIP. Or open a clan above and join it.` : undefined}
            error={name && !valid ? "Use 3 to 24 characters: a-z, 0-9 and -, not starting or ending with -." : null}
          />
          <Button className="mt-2" variant="secondary" disabled={!valid || busy || near.keyState === "checking"} loading={busy} loadingLabel="Founding…" onClick={() => void found()}>
            Found {valid ? name : "a clan"}
          </Button>
        </div>
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
  );
}
