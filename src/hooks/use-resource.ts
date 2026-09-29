"use client";

import { useCallback, useEffect, useEffectEvent, useState, type DependencyList } from "react";
import { loadServices } from "@/services";
import type { KovaServices } from "@/services/contracts";
import type { DataSource, ServiceError, ServiceResult } from "@/types/service";
import { useViewer, type Viewer } from "@/features/auth/viewer";

export type ResourceState<T> =
  | { status: "loading"; data: T | null; source: null }
  | { status: "ready"; data: T; source: DataSource; updatedAt: number }
  | { status: "error"; data: T | null; error: ServiceError; source: null }
  | { status: "pending"; data: null; error: ServiceError; source: null };

export interface UseResourceOptions {
  /** Skip fetching until true (e.g. wait for an id). */
  enabled?: boolean;
  /** Re-fetch on this interval, keeping the current data on screen while it runs. */
  refreshMs?: number;
  /** False for principal-only reads whose request never uses a wallet. */
  walletSensitive?: boolean;
}

export interface UseResource<T> {
  state: ResourceState<T>;
  refetch: () => void;
}

/** Account changes always invalidate; wallet-sensitive reads also track the wallet. */
export function resourceRequestKey(deps: DependencyList, viewer: Pick<Viewer, "status" | "userId" | "walletAddress">, walletSensitive = true): string {
  return JSON.stringify([deps, viewer.status, viewer.userId, walletSensitive ? viewer.walletAddress : null]);
}

/**
 * Loads one service result and models the four states every section needs:
 * loading, ready, error and pending (backend capability not connected).
 *
 * `deps` identifies the request; changing them shows the loading state.
 * A background refresh (`refreshMs`, `refetch`) keeps the last data visible.
 */
export function useResource<T>(
  load: (services: KovaServices, ctx: { getAccessToken: () => Promise<string | null>; signal: AbortSignal; accountId: string | null }) => Promise<ServiceResult<T>>,
  deps: DependencyList,
  options: UseResourceOptions = {},
): UseResource<T> {
  const { enabled = true, refreshMs, walletSensitive = true } = options;
  const viewer = useViewer();
  const { getAccessToken } = viewer;
  const paramKey = resourceRequestKey(deps, viewer, walletSensitive);
  const [nonce, setNonce] = useState(0);
  const [entry, setEntry] = useState<{ paramKey: string; result: ServiceResult<T>; at: number } | null>(null);

  const run = useEffectEvent(async (signal: AbortSignal) => {
    const services = await loadServices();
    return load(services, { getAccessToken, signal, accountId: viewer.userId });
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    run(controller.signal)
      .then((result) => {
        if (!cancelled) setEntry({ paramKey, result, at: Date.now() });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setEntry({
          paramKey,
          at: Date.now(),
          result: { ok: false, error: { code: "NETWORK", message: "Something went wrong. Try again.", retryable: true } },
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [paramKey, nonce, enabled]);

  useEffect(() => {
    if (!enabled || !refreshMs) return;
    const timer = setInterval(() => setNonce((value) => value + 1), refreshMs);
    return () => clearInterval(timer);
  }, [enabled, refreshMs]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  let state: ResourceState<T>;
  const previous = entry?.result.ok ? entry.result.data : null;
  if (!enabled || !entry || entry.paramKey !== paramKey) {
    state = { status: "loading", data: entry?.paramKey === paramKey ? previous : null, source: null };
  } else if (entry.result.ok) {
    state = { status: "ready", data: entry.result.data, source: entry.result.source, updatedAt: entry.at };
  } else if (entry.result.error.code === "PENDING_INTEGRATION") {
    state = { status: "pending", data: null, error: entry.result.error, source: null };
  } else {
    state = { status: "error", data: null, error: entry.result.error, source: null };
  }

  return { state, refetch };
}
