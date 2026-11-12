"use client";

/** The player's pick for a seat, kept in this browser until the settler has it. */
export function pickStore(account: string, tableId: string) {
  return `kova.near.pick.v1.${account}.${tableId}`;
}

export function currentStore(account: string) {
  return `kova.near.current.v1.${account}`;
}

/** Sends a seated player's pick to the settler, retrying briefly. The pick stays saved locally. */
export async function deliverPick(tableId: string, player: string): Promise<{ ok: boolean; message?: string }> {
  const raw = window.localStorage.getItem(pickStore(player, tableId));
  if (!raw) return { ok: false, message: "This browser does not hold the pick for that seat." };
  const pick = JSON.parse(raw) as { market: string; salt: string };
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("/api/near/picks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tableId, player, ...pick }) }).catch(() => null);
    if (response?.ok) return { ok: true };
    last = response ? ((await response.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${response.status}` : "Network error";
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return { ok: false, message: last };
}
