"use client";

import { ArrowUpRight, ChefHat, Rocket } from "lucide-react";
import { formatNear, type LaunchLobbyJson, MEME_COOKING } from "@/adapters/near/meme-cooking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { daysAgo, indexLagHours, launchesHeading, lineProgress, timeLeft } from "./launches";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";

type LobbyResponse = LaunchLobbyJson & { stale?: boolean; error?: { message: string } };

async function readLobby(): Promise<LobbyResponse> {
  const response = await fetch("/api/near/launches");
  const body = (await response.json()) as LobbyResponse;
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}

function BackIt({ url, symbol }: { url: string; symbol: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      aria-label={`Back ${symbol} on meme.cooking (opens meme.cooking)`}
    >
      Back it on meme.cooking <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  );
}

/**
 * The launch lobby: what is cooking on meme.cooking right now and what launched last. Deposits,
 * the launch line and the end time of a cooking auction are read from meme.cooking's contract on
 * NEAR mainnet; the list of launches comes from its public index.
 */
export function LaunchLobby() {
  const lobby = usePoll(readLobby, 60_000, "launch-lobby");
  const now = useNow();
  const data = lobby.data;
  const lag = indexLagHours(data?.indexLagBlocks ?? null);

  return (
    <Card as="section" className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] font-bold text-text-primary">Beside the launchpad</h2>
        <span className="flex items-center gap-2">
          {lobby.stale || data?.stale ? <Badge tone="warning">Showing the last read; retrying</Badge> : null}
          <a className="text-[12px] text-text-muted underline" href={MEME_COOKING.site} target="_blank" rel="noreferrer">
            meme.cooking
          </a>
        </span>
      </div>

      {!data ? (
        <div className="mt-3 text-[13px] text-text-muted">
          {lobby.error ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>meme.cooking cannot be read right now ({lobby.error}). The tables below work as usual.</span>
              <Button size="sm" variant="secondary" onClick={() => lobby.refresh()}>
                Try again
              </Button>
            </div>
          ) : (
            "Reading meme.cooking…"
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary">
              <ChefHat size={15} aria-hidden="true" /> Cooking now
            </h3>
            {data.cooking.length === 0 ? (
              <p className="mt-2 text-[13px] leading-5 text-text-muted">Nothing is cooking on meme.cooking right now. An auction can open at any time; this checks every minute.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {data.cooking.map((a) => {
                  const pct = lineProgress(a.raised, a.softCap);
                  return (
                    <li key={a.id} className="rounded-xl border border-border-subtle bg-surface-2 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[15px] font-semibold text-text-primary">
                          {a.symbol} <span className="text-[12px] font-normal text-text-muted">{a.name}</span>
                        </span>
                        <span className="num shrink-0 text-[12px] text-text-secondary">{timeLeft(a.endsAt, now)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pct)} aria-label={`${a.symbol}: ${pct}% of its launch line`}>
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
                      </div>
                      <p className="num mt-1.5 text-[12px] text-text-secondary">
                        {formatNear(BigInt(a.raised))} of {formatNear(BigInt(a.softCap), 0)} NEAR to launch
                        {a.stakers !== null ? ` · ${a.stakers} ${a.stakers === 1 ? "depositor" : "depositors"}` : ""}
                      </p>
                      <BackIt url={a.url} symbol={a.symbol} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-text-secondary">
              <Rocket size={15} aria-hidden="true" /> {launchesHeading(data.launched, now)}
            </h3>
            {data.launched.length === 0 ? (
              <p className="mt-2 text-[13px] text-text-muted">No launch on record.</p>
            ) : (
              <ul className="mt-1 divide-y divide-border-subtle">
                {data.launched.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                    <span className="min-w-0">
                      <span className="text-[14px] font-semibold text-text-primary">{t.symbol}</span>{" "}
                      <span className="num text-[12px] text-text-muted">
                        launched {daysAgo(t.launchedAt, now)} · raised {formatNear(BigInt(t.raised), 0)} NEAR
                      </span>
                    </span>
                    <BackIt url={t.url} symbol={t.symbol} />
                  </li>
                ))}
              </ul>
            )}
            <p className="num mt-2 text-[11px] text-text-muted">
              {data.launchesTotal} of {data.auctionsTotal} meme.cooking auctions have launched.
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-4 text-text-muted">
        Read from <code>{MEME_COOKING.contract}</code> on NEAR mainnet and meme.cooking&apos;s public index. Kova is not affiliated with meme.cooking; CHIP is a testnet token with no value.
        {lag ? ` meme.cooking's index is about ${lag} ${lag === 1 ? "hour" : "hours"} behind; the deposits shown are read from the contract.` : ""}
      </p>
    </Card>
  );
}
