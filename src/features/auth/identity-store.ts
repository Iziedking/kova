"use client";

import { useSyncExternalStore } from "react";
import type { KovaIdentity } from "@/types/social";

/**
 * The viewer's Kova identity (username, avatar, display name).
 *
 * INTEGRATION SEAM: profiles are not stored by the backend yet (see
 * `ProfileService`). Until they are, the identity is kept in this browser only,
 * keyed by the Privy user id, so the first-run step is honest and skippable on
 * return. When `ProfileService.saveIdentity` is implemented, `saveIdentity` in
 * the viewer provider should call it first and treat this store as a cache.
 */
const PREFIX = "kova.identity.v1:";
const listeners = new Set<() => void>();
let cache = new Map<string, KovaIdentity | null>();

function storageKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function readIdentity(userId: string): KovaIdentity | null {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  let parsed: KovaIdentity | null = null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw) {
      const value = JSON.parse(raw) as Partial<KovaIdentity>;
      if (typeof value.username === "string" && typeof value.avatarSeed === "string") {
        parsed = {
          username: value.username,
          displayName: value.displayName ?? null,
          avatarUrl: value.avatarUrl ?? null,
          avatarSeed: value.avatarSeed,
        };
      }
    }
  } catch {
    // Private mode or blocked storage: behave as if nothing is stored.
  }
  cache.set(userId, parsed);
  return parsed;
}

export function writeIdentity(userId: string, identity: KovaIdentity): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(identity));
  } catch {
    // Keep it in memory for this session even if storage is unavailable.
  }
  cache.set(userId, identity);
  listeners.forEach((notify) => notify());
}

export function clearIdentityCache(): void {
  cache = new Map();
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) {
      cache = new Map();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reactive read. `undefined` while the userId is unknown or on the server. */
export function useStoredIdentity(userId: string | null): KovaIdentity | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? readIdentity(userId) : undefined),
    () => undefined,
  );
}

/** Rules for a Kova username. Availability is a backend concern; format is not. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Choose a username.";
  if (trimmed.length < 3) return "Use at least 3 characters.";
  if (trimmed.length > 20) return "Use 20 characters or fewer.";
  if (!USERNAME_PATTERN.test(trimmed)) return "Letters, numbers and underscores only.";
  return null;
}

/** Turns an X handle or email local-part into a valid suggested username. */
export function suggestUsername(seed: string | null | undefined): string {
  const cleaned = (seed ?? "").replace(/@.*$/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return cleaned.length >= 3 ? cleaned : "";
}
