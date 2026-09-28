"use client";

import { CheckCircle2, Lock, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { loadServices } from "@/services";
import { formatAnsemRaw, formatUsdPrice } from "@/lib/format";
import { AssetAvatar } from "@/components/markets/asset-avatar";
import { PriceChange } from "@/components/markets/price-change";
import { LockedHand } from "@/components/prediction/locked-hand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineNotice, PendingState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { TableDetail } from "@/types/competition";
import type { MarketAsset } from "@/types/market";

type Validation =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid"; asset: MarketAsset }
  | { status: "invalid"; message: string; asset?: MarketAsset }
  | { status: "pending"; message: string };

/**
 * The secret pick flow (blueprint 12/13): enter a ticker or contract address, the
 * Dealer checks the exact mint is eligible, then the pick is locked. A locked pick
 * is not shown to other players - and this component never displays it back:
 * once locked it shows only a face-down card.
 *
 * The backend admits picks through the Dealer, which is not live yet; until it is,
 * validation and locking come back as a pending state and are reported as such.
 */
export function LockPickPanel({ table, onLocked }: { table: TableDetail; onLocked: () => void }) {
  const viewer = useViewer();
  const [query, setQuery] = useState("");
  const [validation, setValidation] = useState<Validation>({ status: "idle" });
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const { state, refetch } = useResource((s, ctx) => s.prediction.viewerState(table.id, ctx), [table.id]);
  const stocks = useResource((s) => s.markets.memeStocks({ limit: 100 }), [], { refreshMs: 60_000 });
  const ctx = { getAccessToken: viewer.getAccessToken, wallet: viewer.gameWallet };
  const needle = query.trim().toLowerCase();
  const choices = stocks.state.status === "ready"
    ? stocks.state.data.assets.filter((asset) => !needle || asset.symbol.toLowerCase().includes(needle) || asset.name.toLowerCase().includes(needle) || asset.mint.toLowerCase() === needle).slice(0, 12)
    : [];

  if (state.status === "ready" && state.data.hasLockedPick) {
    return (
      <section aria-labelledby="pick-title" className="rounded-panel border border-accent-line bg-accent-soft/40 p-5">
        <div className="flex items-center gap-5">
          <LockedHand />
          <div>
            <h2 id="pick-title" className="font-display text-[20px] font-bold text-text-primary">Pick locked</h2>
            <p className="mt-1 max-w-[420px] text-[14px] text-text-secondary">
              Your selection stays secret until the showdown. Nobody - including your opponents - can see it, and it can&apos;t be changed.
            </p>
            {state.data.commitmentShort ? (
              <p className="num mt-2 text-[12px] text-text-muted">Commitment {state.data.commitmentShort}</p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  async function validate(picked?: string) {
    const value = (picked ?? query).trim();
    if (value.length < 2) return;
    setValidation({ status: "checking" });
    setLockError(null);
    const services = await loadServices();
    const result = await services.prediction.validatePick(table.id, value, ctx);
    if (!result.ok) {
      setValidation(
        result.error.code === "PENDING_INTEGRATION"
          ? { status: "pending", message: result.error.message }
          : { status: "invalid", message: result.error.message },
      );
      return;
    }
    setValidation(
      result.data.eligible
        ? { status: "valid", asset: result.data.asset }
        : {
            status: "invalid",
            asset: result.data.asset,
            message: `The Dealer didn't admit $${result.data.asset.symbol}. Predict tables take stock-themed meme tokens only. ${result.data.reason ?? ""}`.trim(),
          },
    );
  }

  async function lock() {
    if (validation.status !== "valid") return;
    setLocking(true);
    setLockError(null);
    const services = await loadServices();
    const result = await services.prediction.lockPick(table.id, validation.asset.mint, ctx);
    setLocking(false);
    if (!result.ok) {
      setLockError(result.error.message);
      return;
    }
    toast.success("Pick locked and stake deposited");
    refetch();
    onLocked();
  }

  return (
    <section aria-labelledby="pick-title" className="rounded-panel border border-border-subtle bg-surface-1 p-5">
      <div className="flex items-start gap-4">
        <LockedHand locked={false} size="sm" className="hidden sm:grid" />
        <div className="min-w-0 flex-1">
          <h2 id="pick-title" className="font-display text-[20px] font-bold text-text-primary">Make your secret pick</h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            Choose the meme stock you think moves most. You don&apos;t buy it. Once locked, it stays hidden until the showdown.
          </p>

          <form
            className="mt-4 flex flex-col gap-2.5 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void validate();
            }}
          >
            <Input
              label="Ticker or contract address"
              hideLabel
              placeholder="Ticker or contract address"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (validation.status !== "idle") setValidation({ status: "idle" });
              }}
              iconLeft={<Search size={16} />}
              autoCapitalize="none"
              spellCheck={false}
              disabled={locking}
            />
            <Button type="submit" variant="secondary" loading={validation.status === "checking"} loadingLabel="Checking…" disabled={query.trim().length < 2 || locking} className="sm:w-auto">
              Check pick
            </Button>
          </form>

          {validation.status === "pending" ? (
            <PendingState compact className="mt-4" title="The Dealer isn't admitting picks yet" body={validation.message} capability="prediction.dealer_admission" />
          ) : null}

          {validation.status === "invalid" ? (
            <InlineNotice tone="warning" className="mt-4">
              <span className="flex items-start gap-2"><ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {validation.message}</span>
            </InlineNotice>
          ) : null}

          {validation.status !== "valid" && validation.status !== "checking" && choices.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-text-muted">
                {needle ? "Matching stock tokens" : "Stock-themed tokens on ClawPump"}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Eligible picks">
                {choices.map((asset) => (
                  <li key={asset.mint}>
                    <button
                      type="button"
                      disabled={locking}
                      onClick={() => {
                        setQuery(asset.symbol);
                        void validate(asset.mint);
                      }}
                      className="flex w-full items-center gap-3 rounded-card border border-border-subtle bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-accent-line hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <AssetAvatar symbol={asset.symbol} imageUrl={asset.imageUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-text-primary">${asset.symbol}</span>
                        <span className="block truncate text-[12px] text-text-secondary">{asset.underlyingTicker ? `${asset.underlyingTicker} · ` : ""}{asset.name}</span>
                      </span>
                      <span className="text-right">
                        <span className="num block text-[13px] text-text-primary">{formatUsdPrice(asset.priceUsd)}</span>
                        <PriceChange value={asset.change24hPct} className="text-[12px]" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-text-muted">Tap one to have the Dealer check it, or type any ticker or contract address.</p>
            </div>
          ) : null}

          {validation.status === "valid" ? (
            <div className="mt-4 rounded-card border border-success/25 bg-success-soft/40 p-4">
              <div className="flex items-center gap-3">
                <AssetAvatar symbol={validation.asset.symbol} imageUrl={validation.asset.imageUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-text-primary">${validation.asset.symbol}</p>
                  <p className="truncate text-[13px] text-text-secondary">{validation.asset.name}</p>
                </div>
                <div className="text-right">
                  <p className="num text-[15px] font-semibold text-text-primary">{formatUsdPrice(validation.asset.priceUsd)}</p>
                  <PriceChange value={validation.asset.change24hPct} className="text-[13px]" />
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-success">
                <CheckCircle2 size={14} aria-hidden="true" /> The Dealer confirmed this market is eligible.
              </p>
              {lockError ? <InlineNotice tone="danger" className="mt-3">{lockError}</InlineNotice> : null}
              <Button className="mt-4" block size="lg" loading={locking} loadingLabel="Waiting for your wallet…" iconLeft={<Lock size={16} />} onClick={() => void lock()}>
                Lock pick and stake {formatAnsemRaw(table.stakeAnsemRaw)}
              </Button>
              <p className="mt-2 text-center text-[12px] text-text-muted">
                Your wallet asks twice: once to prove it&apos;s yours (no funds move), once to deposit the stake into escrow. You can&apos;t change a pick once it&apos;s locked.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
