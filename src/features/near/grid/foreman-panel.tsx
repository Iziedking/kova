"use client";

import { Check, Hammer, X } from "lucide-react";
import { FOREMAN_ACCOUNT, FOREMAN_NAMESPACE_OWNER, SOCIAL_CONTRACT, shortAccount } from "@/adapters/near/grid";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/section";
import { usePoll } from "../use-poll";
import { getGrid } from "./use-grid";
import { ExplorerLink } from "./ui";

/** Whether the Foreman's latest recap carried an AI sentence, read from the chain, and which model wrote it. */
export function useForemanAi() {
  const feed = usePoll(() => getGrid().foremanFeed(), 15_000, "foreman-feed");
  const latest = feed.data?.[0];
  const backend = latest?.via === "near-ai" ? "NEAR AI Cloud" : latest?.via === "brrrain" ? "BRRRAIN" : null;
  return { feed, loaded: feed.data !== null, live: latest?.by === "ai", model: latest?.model ?? null, backend };
}

/** One honest line, shown only when the latest recap really carried an AI remark. Until a key is connected it shows nothing. */
export function ForemanAiStatus({ className }: { className?: string }) {
  const ai = useForemanAi();
  if (!ai.loaded || !ai.live) return null;
  return (
    <p className={className}>
      <span className="font-semibold text-text-primary">AI status: </span>
      {`live. Latest remark by ${ai.model} via ${ai.backend}.`}
    </p>
  );
}

/**
 * The Foreman: an account that mines beside you with a fixed rule and posts a recap of each round to
 * NEAR's social contract. Its recaps and its keys are read from the chain here, so "it can only stake
 * CHIP and post" is something you can see, not something we say.
 */
export function ForemanPanel() {
  const grid = getGrid();
  const { feed, live } = useForemanAi();
  const keys = usePoll(() => grid.keyList(FOREMAN_ACCOUNT), 60_000, "foreman-keys");
  const noFullAccess = keys.data ? keys.data.every((k) => k.permission !== "FullAccess") : null;
  return (
    <Card className="scroll-mt-24 p-5" as="section" id="foreman">
      <SectionHeader title="The Foreman" as="h2" icon={<Hammer size={18} />} badge={live ? <Badge tone="accent">AI remark live</Badge> : undefined} />
      <p className="text-[14px] leading-6 text-text-secondary">
        An account that mines beside you. While it runs, it stakes 10 CHIP on two squares each round, then posts a recap on chain. Facts come from the chain.{" "}
        {live ? "An AI remark from NEAR AI Cloud is added to each recap." : "Recaps are plain templates for now; the AI remark is off until an AI key is connected."} Account:{" "}
        <ExplorerLink href={grid.accountUrl(FOREMAN_ACCOUNT)}>{shortAccount(FOREMAN_ACCOUNT, 36)}</ExplorerLink>.
      </p>

      <ForemanAiStatus className="mt-2 text-[13px] leading-5 text-text-secondary" />

      <div className="mt-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-text-secondary">
          Its keys
          {noFullAccess === true ? <span className="inline-flex items-center gap-1 text-success"><Check size={14} aria-hidden="true" /> none can move coins</span> : null}
          {noFullAccess === false ? <span className="inline-flex items-center gap-1 text-warning"><X size={14} aria-hidden="true" /> has a full-access key</span> : null}
        </h3>
        {keys.error && !keys.data ? <p className="mt-1 text-[13px] text-text-secondary">Could not load keys: {keys.error}</p> : null}
        {keys.data ? (
          <ul className="mt-1 divide-y divide-border-subtle text-[13px] text-text-secondary">
            {keys.data.map((k) => (
              <li key={k.publicKey} className="py-1.5">
                {k.permission === "FullAccess" ? "A full-access key." : <>Can only call <span className="num text-text-primary">{k.permission.methods.join(", ")}</span> on {shortAccount(k.permission.receiver, 34)}.</>}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4">
        <h3 className="text-[13px] font-semibold text-text-secondary">Latest recaps</h3>
        {feed.error && !feed.data ? <p className="mt-1 text-[13px] text-text-secondary">Could not load recaps: {feed.error}</p> : null}
        {feed.data && feed.data.length === 0 ? <p className="mt-1 text-[14px] text-text-secondary">No recaps yet.</p> : null}
        {feed.data && feed.data.length > 0 ? (
          <ol className="mt-1 divide-y divide-border-subtle">
            {feed.data.map((p) => (
              <li key={p.round} className="py-2.5 text-[14px] leading-6 text-text-primary">
                {p.text}
                {p.by === "ai" && p.remark ? <span className="mt-1 block text-[13px] italic text-text-secondary">AI remark ({p.model}{p.via === "brrrain" ? " via BRRRAIN" : p.via === "near-ai" ? " via NEAR AI" : ""}): {p.remark}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-muted">
        The AI remark is checked: it cannot add numbers the facts lack. Last five recaps live at <span className="num">{shortAccount(FOREMAN_NAMESPACE_OWNER, 30)}/kova/foreman</span> on {SOCIAL_CONTRACT}. It runs only while someone funds and starts it.
      </p>
    </Card>
  );
}
