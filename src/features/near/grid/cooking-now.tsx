"use client";

import { ArrowUpRight, ChefHat } from "lucide-react";
import { formatNear, type LaunchLobbyJson } from "@/adapters/near/meme-cooking";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/section";
import { daysAgo, lineProgress, timeLeft } from "../launches";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";

type Lobby = LaunchLobbyJson & { stale?: boolean };

async function readCooking(): Promise<Lobby> {
  const response = await fetch("/api/near/cooking");
  const body = (await response.json()) as Lobby & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}

/**
 * What is cooking on meme.cooking right now, read from its mainnet contract and public index.
 * Kova has no partnership with meme.cooking and its mines for these coins do not exist yet: this
 * testnet factory accepts only CHIP and JAMBO, so the panel says what is cooking, not what is minable.
 */
export function CookingNow() {
  const now = useNow();
  const cooking = usePoll(readCooking, 30_000, "cooking");
  const items = cooking.data?.cooking.slice(0, 4) ?? [];
  const launched = cooking.data?.launched.slice(0, 3) ?? [];
  return (
    <Card className="p-5" as="section">
      <SectionHeader title="Cooking now on meme.cooking" as="h2" icon={<ChefHat size={18} />} badge={<Badge tone="outline">mainnet, read only</Badge>} />
      {cooking.error && !cooking.data ? <p className="text-[14px] text-text-secondary">Could not load meme.cooking ({cooking.error}). Retrying.</p> : null}
      {!cooking.data && !cooking.error ? <p className="text-[14px] text-text-secondary">Loading…</p> : null}
      {cooking.data && items.length === 0 ? <p className="text-[14px] text-text-secondary">Nothing cooking right now.</p> : null}
      {items.length > 0 ? (
        <ul className="divide-y divide-border-subtle">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-text-primary">{a.name} <span className="font-normal text-text-muted">{a.symbol}</span></p>
                <p className="num text-[12px] text-text-muted">{formatNear(BigInt(a.raised))} of {formatNear(BigInt(a.softCap))} NEAR to launch ({lineProgress(a.raised, a.softCap)}%) · {timeLeft(a.endsAt, now)} left</p>
              </div>
              <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#b79bff] hover:text-[#d0bdff]">
                Back it <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {launched.length > 0 ? (
        <div className={items.length > 0 ? "mt-4 border-t border-border-subtle pt-4" : "mt-1"}>
          <h3 className="text-[13px] font-semibold text-text-secondary">Recently launched</h3>
          <ul className="mt-1 divide-y divide-border-subtle">
            {launched.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <p className="min-w-0 truncate text-[14px] text-text-primary">{t.name} <span className="text-text-muted">{t.symbol}</span> <span className="num text-[12px] text-text-muted">· raised {formatNear(BigInt(t.raised))} NEAR · {daysAgo(t.launchedAt, now)}</span></p>
                <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#b79bff] hover:text-[#d0bdff]">
                  View <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-[12px] leading-5 text-text-muted">Not affiliated with meme.cooking. These coins have no Kova mine yet. Mainnet mines are planned, not built.{cooking.data?.stale ? " Showing the last answer." : ""}</p>
    </Card>
  );
}
