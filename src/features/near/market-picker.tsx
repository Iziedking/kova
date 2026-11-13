"use client";

/**
 * The pick: a coin traded on NEAR, or a "Will it cook?" call on a meme.cooking auction. Used by the
 * play page (a new round) and the table page (joining a table, where the host fixed the round).
 */
import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { callMarket, callRoundSeconds, callSymbol } from "@/adapters/near/launch-calls";
import { formatNear, type LaunchLobbyJson, memeUrl } from "@/adapters/near/meme-cooking";
import { cn } from "@/lib/cn";
import { timeLeft } from "./launches";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";

export type Market = {
  id: string;
  symbol: string;
  name: string;
  group: "busy" | "launch" | "meme";
  memeCookingId?: number;
  available: boolean;
  priceUsd?: string;
  liquidityUsd?: number;
  change1hPct?: number | null;
  trades5m?: number;
  trades1h?: number;
  reason?: string;
};

export type CallableAuction = LaunchLobbyJson["cooking"][number];

const MARKET_GROUPS = [
  { group: "busy", title: "Trades every minute", hint: "Busy NEAR pools. Best for 60 s and 90 s rounds." },
  { group: "launch", title: "Launched on meme.cooking", hint: "Launches that still trade a few times an hour. Pick a 5 min round; a coin with no trades scores 0." },
  { group: "meme", title: "NEAR memecoins", hint: "Thin pools. A coin with no trades scores 0, so short rounds often tie." },
] as const;

function marketActivity(m: Market): string {
  if (!m.available) return "unavailable";
  const move = m.change1hPct !== null && m.change1hPct !== undefined ? `${m.change1hPct > 0 ? "+" : ""}${m.change1hPct}% 1h · ` : "";
  const trades = m.trades5m ? `${m.trades5m} trades in 5 min` : m.trades1h ? `${m.trades1h} trades in 1h` : "no trades in 1h";
  return `${move}${trades}`;
}

export async function readLaunches(): Promise<LaunchLobbyJson> {
  const response = await fetch("/api/near/launches");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as LaunchLobbyJson;
}

/** The coin list with live activity, and the auctions a call can be made on now. */
export function usePickOptions(roundWindowSeconds: number | null = null) {
  const now = useNow();
  const markets = usePoll(async () => ((await (await fetch("/api/near/markets")).json()) as { markets: Market[] }).markets, 60_000, "markets");
  const launches = usePoll(readLaunches, 60_000, "launches");
  const callable = useMemo(
    () =>
      (launches.data?.cooking ?? []).filter((a) => {
        if (callRoundSeconds(a.endsAt, now * 1000) === null) return false;
        // Joining a table whose round is fixed: the auction must end before that round would.
        return roundWindowSeconds === null || a.endsAt <= (now + roundWindowSeconds) * 1000;
      }),
    [launches.data, now, roundWindowSeconds],
  );
  return { markets, callable, now, launchesRead: !!launches.data || !!launches.error };
}

function Choice({ selected, disabled, title, onClick, children }: { selected: boolean; disabled?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl border px-3 py-2 text-left transition-colors",
        selected ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-2 hover:border-border-strong",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function MarketPicker({
  value,
  onChange,
  markets,
  callable,
  now,
}: {
  value: string | null;
  onChange: (market: string) => void;
  markets: Market[] | null;
  callable: CallableAuction[];
  now: number;
}) {
  return (
    <div role="radiogroup" aria-label="Pick a coin traded on NEAR, or call a meme.cooking auction" className="space-y-4">
      {callable.length ? (
        <div>
          <p className="text-[13px] font-semibold text-text-primary">Will it cook?</p>
          <p className="mb-2 text-[12px] text-text-muted">Call whether a meme.cooking auction reaches its launch line. The round runs until it ends; the right call scores +100%.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {callable.flatMap((a) =>
              (["cooks", "flops"] as const).map((side) => {
                const id = callMarket(a.id, callSymbol(a.symbol), side);
                return (
                  <Choice key={id} selected={value === id} onClick={() => onChange(id)}>
                    <span className="block text-[14px] font-semibold text-text-primary">
                      {a.symbol} {side === "cooks" ? "cooks" : "does not cook"}
                    </span>
                    <span className="num block text-[11px] text-text-muted">
                      {formatNear(BigInt(a.raised))} of {formatNear(BigInt(a.softCap), 0)} NEAR · {timeLeft(a.endsAt, now)}
                    </span>
                  </Choice>
                );
              }),
            )}
          </div>
        </div>
      ) : null}
      {MARKET_GROUPS.map(({ group, title, hint }) => {
        const rows = (markets ?? []).filter((m) => m.group === group);
        if (!rows.length) return null;
        return (
          <div key={group}>
            <p className="text-[13px] font-semibold text-text-primary">{title}</p>
            <p className="mb-2 text-[12px] text-text-muted">
              {hint}
              {group === "launch"
                ? rows
                    .filter((m) => m.memeCookingId !== undefined)
                    .map((m) => (
                      <a key={m.id} className="ml-2 inline-flex items-center gap-0.5 underline" href={memeUrl(m.memeCookingId as number)} target="_blank" rel="noreferrer">
                        {m.symbol} on meme.cooking <ArrowUpRight size={11} aria-hidden="true" />
                      </a>
                    ))
                : null}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rows.map((m) => (
                <Choice key={m.id} selected={value === m.id} disabled={!m.available} title={m.available ? m.name : m.reason} onClick={() => onChange(m.id)}>
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
                    {m.symbol}
                    {m.available && m.trades5m ? <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" /> : null}
                  </span>
                  <span className="num block text-[11px] text-text-muted">{marketActivity(m)}</span>
                </Choice>
              ))}
            </div>
          </div>
        );
      })}
      {!markets ? <p className="text-[13px] text-text-muted">Loading NEAR markets…</p> : null}
      <p className="text-[11px] text-text-muted">Mainnet prices from one fixed Rhea pool per coin, read through DEX Screener, scoring a game played with a testnet token.</p>
    </div>
  );
}

/** Radio pills for stake, round length and seats. */
export function Pills<T extends string | number>({ label, options, value, onChange, format = (v) => String(v) }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-text-secondary">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn("num h-11 min-w-12 rounded-lg border px-3 text-[13px] font-semibold", value === o ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary hover:text-text-primary")}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
