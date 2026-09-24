"use client";

import { CheckCircle2, Lock, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { loadServices } from "@/services";
import { formatUsdPrice } from "@/lib/format";
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

  const { state, refetch } = useResource((s) => s.prediction.viewerState(table.id), [table.id]);
  const ctx = { getAccessToken: viewer.getAccessToken };

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

  async function validate() {
    const value = query.trim();
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
        : { status: "invalid", asset: result.data.asset, message: result.data.reason ?? "This market isn't eligible for Prediction tables." },
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
    toast.success("Pick locked");
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
            <InlineNotice tone="danger" className="mt-4">
              <span className="flex items-center gap-2"><ShieldAlert size={15} aria-hidden="true" /> {validation.message}</span>
            </InlineNotice>
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
              <Button className="mt-4" block size="lg" loading={locking} loadingLabel="Locking…" iconLeft={<Lock size={16} />} onClick={() => void lock()}>
                Lock pick
              </Button>
              <p className="mt-2 text-center text-[12px] text-text-muted">You can&apos;t change a pick once it&apos;s locked.</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
