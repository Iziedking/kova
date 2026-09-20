"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { loadServices } from "@/services";
import type { DataSource } from "@/types/service";
import type { DraftOrder, Trade, TradeFlowStatus, TradeQuote } from "@/types/trading";

export interface QuoteState {
  status: "idle" | "loading" | "ready" | "pending" | "error";
  quote: TradeQuote | null;
  source: DataSource | null;
  message: string | null;
}

const IDLE_QUOTE: QuoteState = { status: "idle", quote: null, source: null, message: null };

/**
 * An indicative quote for the draft order, fetched from the backend as the person
 * types (debounced). The estimate shown in the ticket is this quote and only
 * this quote: the frontend never computes execution from a price it holds.
 */
export function useTradeQuote(order: DraftOrder | null): QuoteState & { refresh: () => void } {
  const viewer = useViewer();
  const [entry, setEntry] = useState<{ key: string; state: QuoteState } | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = order ? `${order.tableId}:${order.assetMint}:${order.side}:${order.inputUsd}:${nonce}` : null;

  useEffect(() => {
    if (!order || !key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const services = await loadServices();
      const result = await services.trading.quote(order, { getAccessToken: viewer.getAccessToken });
      if (cancelled) return;
      if (result.ok) setEntry({ key, state: { status: "ready", quote: result.data, source: result.source, message: null } });
      else
        setEntry({
          key,
          state: { status: result.error.code === "PENDING_INTEGRATION" ? "pending" : "error", quote: null, source: null, message: result.error.message },
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `order` is captured through `key`, which changes whenever any of its fields do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, viewer.getAccessToken]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  if (!key) return { ...IDLE_QUOTE, refresh };
  if (!entry || entry.key !== key) return { ...IDLE_QUOTE, status: "loading", refresh };
  return { ...entry.state, refresh };
}

export interface TradeFlow {
  status: TradeFlowStatus;
  quote: TradeQuote | null;
  trade: Trade | null;
  source: DataSource | null;
  error: string | null;
  /** The stage that was active when a failure happened, so the UI can mark it. */
  failedAt: TradeFlowStatus | undefined;
  /** Open the review step with a quote the backend issued. */
  review: (quote: TradeQuote, source: DataSource | null) => void;
  /** Send the reviewed order for execution and follow it to a terminal state. */
  confirm: () => Promise<void>;
  reset: () => void;
}

const TERMINAL: ReadonlySet<TradeFlowStatus> = new Set(["confirmed", "failed"]);

/**
 * The real-money trade lifecycle - review, prepare, wallet, submitted,
 * confirming, confirmed/failed - as a state machine (blueprint 20). Each stage
 * is its own state; nothing collapses into an indefinite spinner, and
 * `confirmed` is set only when the backend reports the trade confirmed.
 */
export function useTradeFlow(onSettled?: () => void): TradeFlow {
  const viewer = useViewer();
  const [status, setStatus] = useState<TradeFlowStatus>("idle");
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<TradeFlowStatus | undefined>(undefined);
  const statusRef = useRef<TradeFlowStatus>("idle");

  /** Every status change goes through here so a failure remembers where it happened. */
  const move = useCallback((next: TradeFlowStatus) => {
    if (next === "failed") setFailedAt(statusRef.current === "failed" ? undefined : statusRef.current);
    else setFailedAt(undefined);
    statusRef.current = next;
    setStatus(next);
  }, []);

  // Follow a submitted trade until the backend says it is final.
  const tradeId = trade?.id ?? null;
  const inFlight = status === "awaiting_wallet" || status === "submitted" || status === "confirming";
  useEffect(() => {
    if (!tradeId || !inFlight) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const services = await loadServices();
      const result = await services.trading.status(tradeId, { getAccessToken: viewer.getAccessToken });
      if (cancelled) return;
      if (!result.ok) {
        // A failed poll is not a failed trade. Keep the last known state and keep trying.
        return;
      }
      setTrade(result.data);
      const next = result.data.status === "draft" ? "preparing" : result.data.status;
      move(next);
      if (result.data.status === "failed") setError(result.data.failureReason ?? "The trade failed. Nothing was filled.");
      if (TERMINAL.has(next)) onSettled?.();
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tradeId, inFlight, viewer.getAccessToken, onSettled, move]);

  const review = useCallback((next: TradeQuote, from: DataSource | null) => {
    setQuote(next);
    setSource(from);
    setTrade(null);
    setError(null);
    move("reviewing");
  }, [move]);

  const confirm = useCallback(async () => {
    if (!quote) return;
    move("preparing");
    setError(null);
    const services = await loadServices();
    const result = await services.trading.execute(quote.quoteId, { getAccessToken: viewer.getAccessToken });
    if (!result.ok) {
      move("failed");
      setError(result.error.message);
      return;
    }
    setTrade(result.data);
    move(result.data.status === "draft" ? "preparing" : result.data.status);
    if (result.data.status === "failed") setError(result.data.failureReason ?? "The trade failed. Nothing was filled.");
  }, [quote, viewer.getAccessToken, move]);

  const reset = useCallback(() => {
    move("idle");
    setQuote(null);
    setTrade(null);
    setError(null);
    setSource(null);
  }, [move]);

  return { status, quote, trade, source, error, failedAt, review, confirm, reset };
}
