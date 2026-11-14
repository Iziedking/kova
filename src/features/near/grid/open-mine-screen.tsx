"use client";

import { Hammer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { failureMessage } from "@/adapters/near/chip";
import { GAS, GRID_FACTORY, MAINNET_PLAN, MINE_DEPOSIT_YOCTO, formatUnits, limitWarnings, parseUnits, plainUnits, plannedMainnetCoin, shortAccount, suggestLimits } from "@/adapters/near/grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, SectionHeader } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { SignInChoice } from "../sign-in-choice";
import { minePath } from "../paths";
import { usePoll } from "../use-poll";
import { openAndRegister } from "./open-flow";
import { registerMine } from "./register-mine";
import { getGrid, useGridPlayer } from "./use-grid";
import { ExplorerLink, Page, PageTitle } from "./ui";

/** A coin account id: lowercase letters, digits, dots, dashes and underscores. The factory is the judge of the rest. */
const looksLikeAccount = (v: string) => /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(v);

export function OpenMineScreen() {
  const grid = getGrid();
  const player = useGridPlayer();
  const [token, setToken] = useState("");
  // null means "not typed yet": the field shows the suggestion for the coin until the person edits it.
  const [minTyped, setMinText] = useState<string | null>(null);
  const [maxTyped, setMaxText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "danger"; text: string; url?: string; mineFor?: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const factory = usePoll(() => grid.factoryConfig(), 60_000, "factory-config");
  const coin = token.trim();
  const valid = looksLikeAccount(coin);
  const verdict = usePoll(
    valid
      ? async () => {
          const [allowed, existing, meta, supply] = await Promise.all([grid.isTokenAllowed(coin), grid.mineFor(coin), grid.metadata(coin).catch(() => null), grid.totalSupply(coin).catch(() => null)]);
          return { allowed, existing, meta, supply, account: allowed ? await grid.mineAccountFor(coin) : null };
        }
      : null,
    10_000,
    `verdict:${coin}`,
  );
  const v = verdict.data;
  const decimals = v?.meta?.decimals ?? 18;
  const suggestion = v?.meta && v.supply ? suggestLimits(v.supply, v.meta.decimals) : null;
  const minText = minTyped ?? (suggestion ? plainUnits(suggestion.min, decimals) : "1");
  const maxText = maxTyped ?? (suggestion ? plainUnits(suggestion.max, decimals) : "500");
  const min = parseUnits(minText, decimals);
  const max = parseUnits(maxText, decimals);
  const cautions = min !== null && max !== null ? limitWarnings({ min, max, supply: v?.supply ?? null, symbol: v?.meta?.symbol ?? "the coin" }) : [];
  const planned = valid ? plannedMainnetCoin(coin) : null;
  const problem = !valid ? (coin ? "That is not a valid account id." : null) : planned ? "That is a mainnet coin. The mainnet factory is planned but not deployed yet, so it cannot get a mine here. This testnet factory accepts only the coins listed above." : !v ? null : !v.allowed ? "This testnet factory does not accept this coin. See the lists above." : v.existing ? "This coin already has a mine." : min === null || min === 0n ? "The smallest stake must be more than zero." : max === null || max < min ? "The largest stake must be at least the smallest." : !v.meta ? "That account is not a token (no ft_metadata)." : null;

  /** Two steps: the factory creates the mine, then the mine is registered with its coin so it can receive it. */
  async function open() {
    if (min === null || max === null) return;
    const symbol = v?.meta?.symbol ?? "the coin";
    setBusy(true);
    setNotice(null);
    const outcome = await openAndRegister({
      symbol,
      onProgress: setProgress,
      open: async () => {
        const r = await player.near.callContract(GRID_FACTORY, "open_mine", { token: coin, min_stake: min.toString(), max_stake: max.toString(), vein_per_round: "0", vein_halving_days: 0 }, { gas: GAS.openMine, deposit: MINE_DEPOSIT_YOCTO });
        return { success: r.success, failure: r.success ? undefined : failureMessage(r.failure), url: r.explorerUrl || undefined };
      },
      findMine: () => grid.mineFor(coin),
      register: (mine) => registerMine(player.near, grid, coin, mine),
    });
    setBusy(false);
    setProgress(null);
    verdict.refresh();
    if (outcome.stage === "open_failed") setNotice({ tone: "danger", text: outcome.message, url: outcome.url });
    else if (outcome.stage === "mine_missing") setNotice({ tone: "danger", text: "The open request was sent, but the mine has not appeared yet. If it shows up on the Mines page, open it there and press Register.", url: outcome.url });
    else if (outcome.stage === "registration_failed") setNotice({ tone: "danger", text: `The mine is open, but registering it with ${symbol} did not go through: ${outcome.message}. Staking ${symbol} will be refused until it is registered; open the mine and press Register.`, url: outcome.url, mineFor: coin });
    else setNotice({ tone: "info", text: `The ${symbol} mine is open and registered, so it can take ${symbol} now.`, url: outcome.url, mineFor: coin });
  }

  const created = notice?.mineFor && v?.existing;

  return (
    <Page className="max-w-[860px]">
      <PageTitle title="Open a mine">Two steps create a mine for a coin the factory accepts. First you attach {formatUnits(MINE_DEPOSIT_YOCTO, 24)} NEAR; all of it goes to the new mine to run on, and it comes back to you if the mine cannot be created. Then the mine is registered with the coin (about 0.00125 NEAR from you), because a coin cannot send to an account it does not know.</PageTitle>

      <Card className="space-y-4 p-5" as="section">
        <SectionHeader title="Which coins can get a mine" as="h2" className="mb-0" />
        <p className="text-[14px] leading-6 text-text-secondary">Each factory has a fixed list of what it accepts, set when it is deployed and impossible to change afterwards. That is what keeps fake coins out. Anyone can then open a mine for a listed coin, with no permission from us.</p>

        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">On this testnet factory <Badge tone="success" dot>live now</Badge></h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {factory.data?.allowed_tokens.map((t) => (
              <li key={t}><Link href={minePath(t)} className="num inline-block rounded-lg border border-border-subtle px-2.5 py-1 text-[12px] text-text-secondary hover:border-border-strong">{shortAccount(t, 30)}</Link></li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-5 text-text-muted">Both already have a mine, so there is nothing new to open on testnet today.</p>
        </div>

        <div className="border-t border-border-subtle pt-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">Planned for mainnet <Badge tone="warning">not deployed yet</Badge></h3>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-text-secondary">
            <li>
              <span className="font-semibold text-text-primary">Every coin launched on meme.cooking.</span> Its address ends in <span className="num">{MAINNET_PLAN.memeCookingSuffix}</span>, for example <span className="num">{MAINNET_PLAN.memeCookingExample}</span>. Only meme.cooking can create addresses like that, so a fake coin cannot get in, and a brand-new launch can join the moment it exists.
            </li>
            <li><span className="font-semibold text-text-primary">BRRRAIN,</span> <span className="num">{MAINNET_PLAN.brrrain}</span>, and <span className="font-semibold text-text-primary">CHIP.</span></li>
            <li>Other NEAR tokens can be added by name when the mainnet factory is deployed. The list is fixed then, so tell us which.</li>
          </ul>
        </div>
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
        {suggestion && v?.meta ? (
          <p className="num text-[12px] leading-5 text-text-secondary">
            Suggested for {v.meta.symbol}: {formatUnits(suggestion.min, decimals, 6)} to {formatUnits(suggestion.max, decimals, 6)} {v.meta.symbol}. The largest aims for about 0.001% of all {v.meta.symbol} that exist (never below one whole coin), a cautious start.{" "}
            {minTyped !== null || maxTyped !== null ? <button type="button" className="text-[#b79bff] underline" onClick={() => { setMinText(null); setMaxText(null); }}>Use the suggestion</button> : null}
          </p>
        ) : null}
        {cautions.map((c) => <InlineNotice key={c} tone="warning">{c}</InlineNotice>)}
        {player.near.status === "signed_in" ? (
          <Button iconLeft={<Hammer size={16} />} loading={busy} loadingLabel="Working…" disabled={!v?.allowed || !!v?.existing || problem !== null || min === null || max === null} onClick={() => void open()}>
            Open this mine for {formatUnits(MINE_DEPOSIT_YOCTO, 24)} NEAR (plus about 0.00125 NEAR to register it)
          </Button>
        ) : (
          <SignInChoice compact />
        )}
        {progress ? <p role="status" className="text-[13px] text-text-secondary">{progress}</p> : null}
        {notice ? <InlineNotice tone={notice.tone}>{notice.text} {notice.url ? <ExplorerLink href={notice.url}>Transaction</ExplorerLink> : null}</InlineNotice> : null}
        {created ? <p className="text-[14px]"><Link className="font-semibold text-[#b79bff] underline" href={minePath(coin)}>Go to the new mine</Link></p> : null}
      </Card>
    </Page>
  );
}
