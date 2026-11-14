"use client";

import { Hammer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { failureMessage } from "@/adapters/near/chip";
import { GAS, GRID_FACTORY, MINE_DEPOSIT_YOCTO, formatUnits, parseUnits, shortAccount } from "@/adapters/near/grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, SectionHeader } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { SignInChoice } from "../sign-in-choice";
import { minePath } from "../paths";
import { usePoll } from "../use-poll";
import { getGrid, useGridPlayer } from "./use-grid";
import { ExplorerLink, Page, PageTitle } from "./ui";

/** A coin account id: lowercase letters, digits, dots, dashes and underscores. The factory is the judge of the rest. */
const looksLikeAccount = (v: string) => /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(v);

export function OpenMineScreen() {
  const grid = getGrid();
  const player = useGridPlayer();
  const [token, setToken] = useState("");
  const [minText, setMinText] = useState("1");
  const [maxText, setMaxText] = useState("500");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "danger"; text: string; url?: string; mineFor?: string } | null>(null);

  const factory = usePoll(() => grid.factoryConfig(), 600_000, "factory-config");
  const coin = token.trim();
  const valid = looksLikeAccount(coin);
  const verdict = usePoll(
    valid
      ? async () => {
          const [allowed, existing, meta] = await Promise.all([grid.isTokenAllowed(coin), grid.mineFor(coin), grid.metadata(coin).catch(() => null)]);
          return { allowed, existing, meta, account: allowed ? await grid.mineAccountFor(coin) : null };
        }
      : null,
    10_000,
    `verdict:${coin}`,
  );
  const v = verdict.data;
  const decimals = v?.meta?.decimals ?? 18;
  const min = parseUnits(minText, decimals);
  const max = parseUnits(maxText, decimals);
  const problem = !valid ? (coin ? "That is not a valid account id." : null) : !v ? null : !v.allowed ? "The factory does not accept this coin." : v.existing ? "This coin already has a mine." : min === null || min === 0n ? "The smallest stake must be more than zero." : max === null || max < min ? "The largest stake must be at least the smallest." : !v.meta ? "That account is not a token (no ft_metadata)." : null;

  async function open() {
    if (min === null || max === null) return;
    setBusy(true);
    setNotice(null);
    const result = await player.near.callContract(GRID_FACTORY, "open_mine", { token: coin, min_stake: min.toString(), max_stake: max.toString(), vein_per_round: "0", vein_halving_days: 0 }, { gas: GAS.openMine, deposit: MINE_DEPOSIT_YOCTO });
    setBusy(false);
    if (!result.success) {
      setNotice({ tone: "danger", text: failureMessage(result.failure), url: result.explorerUrl || undefined });
      return;
    }
    setNotice({ tone: "info", text: "Sent. The factory is creating the mine; this takes a few seconds.", url: result.explorerUrl, mineFor: coin });
    verdict.refresh();
  }

  const created = notice?.mineFor && v?.existing;

  return (
    <Page className="max-w-[860px]">
      <PageTitle title="Open a mine">One transaction creates a mine for a coin the factory accepts. You attach {formatUnits(MINE_DEPOSIT_YOCTO, 24)} NEAR; all of it goes to the new mine to run on, and it comes back to you if the mine cannot be created.</PageTitle>

      <Card className="space-y-3 p-5" as="section">
        <SectionHeader title="Which coins are accepted" as="h2" className="mb-0" />
        <p className="text-[14px] leading-6 text-text-secondary">The factory has no method that changes this list. It accepts these coins by name{factory.data && factory.data.allowed_suffixes.length > 0 ? `, and any coin that is a direct child of ${factory.data.allowed_suffixes.join(", ")}` : ", and no others"}.</p>
        <ul className="flex flex-wrap gap-2">
          {factory.data?.allowed_tokens.map((t) => (
            <li key={t}><Link href={minePath(t)} className="num inline-block rounded-lg border border-border-subtle px-2.5 py-1 text-[12px] text-text-secondary hover:border-border-strong">{shortAccount(t, 30)}</Link></li>
          ))}
        </ul>
        <p className="text-[12px] text-text-muted">On this testnet factory both accepted coins already have a mine, so there is nothing left to open until another coin is accepted. Mainnet is planned to accept meme.cooking coins.</p>
      </Card>

      <Card className="space-y-4 p-5" as="section">
        <SectionHeader title="Open one" as="h2" icon={<Hammer size={18} />} className="mb-0" />
        <div>
          <label htmlFor="open-token" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Coin account</label>
          <Input id="open-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="jambo.example.testnet" autoComplete="off" spellCheck={false} aria-invalid={!!problem} aria-describedby="open-problem" />
          <p id="open-problem" className="mt-1.5 min-h-5 text-[12px] text-text-muted" aria-live="polite">
            {problem ?? (v?.allowed && !v.existing ? `Accepted. Its mine would be ${shortAccount(v.account ?? "", 40)}.` : valid && !v ? "Checking with the factory…" : "")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="open-min" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Smallest stake</label>
            <Input id="open-min" inputMode="decimal" value={minText} onChange={(e) => setMinText(e.target.value)} className="num" />
          </div>
          <div>
            <label htmlFor="open-max" className="mb-1.5 block text-[13px] font-medium text-text-secondary">Most one player can stake per round</label>
            <Input id="open-max" inputMode="decimal" value={maxText} onChange={(e) => setMaxText(e.target.value)} className="num" />
          </div>
        </div>
        <p className="text-[12px] leading-5 text-text-muted">In whole coins{v?.meta ? ` of ${v.meta.symbol}` : ""}. These limits are fixed for the life of the mine, so pick sizes that suit the coin.</p>
        {player.near.status === "signed_in" ? (
          <Button iconLeft={<Hammer size={16} />} loading={busy} loadingLabel="Opening…" disabled={!v?.allowed || !!v?.existing || problem !== null || min === null || max === null} onClick={() => void open()}>
            Open this mine for {formatUnits(MINE_DEPOSIT_YOCTO, 24)} NEAR
          </Button>
        ) : (
          <SignInChoice compact />
        )}
        {notice ? <InlineNotice tone={notice.tone}>{notice.text} {notice.url ? <ExplorerLink href={notice.url}>Transaction</ExplorerLink> : null}</InlineNotice> : null}
        {created ? <p className="text-[14px]"><Link className="font-semibold text-[#b79bff] underline" href={minePath(coin)}>Go to the new mine</Link></p> : null}
      </Card>
    </Page>
  );
}
