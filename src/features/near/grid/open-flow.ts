/**
 * Opening a mine is two steps: the factory creates it, then it is registered with its coin so the
 * coin can send to it. This runs them in order and says exactly where it stopped, so the page can
 * tell the person what happened and what to do. The effects are passed in, so each branch is tested.
 */
export type OpenOutcome =
  | { stage: "open_failed"; message: string; url?: string }
  | { stage: "mine_missing"; url?: string }
  | { stage: "registration_failed"; mine: string; message: string; url?: string }
  | { stage: "done"; mine: string; alreadyRegistered: boolean; url?: string };

export async function openAndRegister(deps: {
  open: () => Promise<{ success: boolean; failure?: string; url?: string }>;
  findMine: () => Promise<{ mine: string } | null>;
  register: (mine: string) => Promise<{ ok: boolean; already?: boolean; message?: string; url?: string }>;
  onProgress: (text: string) => void;
  symbol: string;
  wait?: (ms: number) => Promise<void>;
  /** How many times to look for the new mine, two seconds apart. */
  attempts?: number;
}): Promise<OpenOutcome> {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  deps.onProgress("Step 1 of 2: opening the mine…");
  const opened = await deps.open();
  if (!opened.success) return { stage: "open_failed", message: opened.failure ?? "The call failed.", url: opened.url };

  deps.onProgress("The factory is creating the mine. This takes a few seconds…");
  let found: { mine: string } | null = null;
  for (let i = 0; i < (deps.attempts ?? 30) && !found; i += 1) {
    found = await deps.findMine().catch(() => null);
    if (!found) await wait(2_000);
  }
  if (!found) return { stage: "mine_missing", url: opened.url };

  deps.onProgress(`Step 2 of 2: registering the mine with ${deps.symbol} (about 0.00125 NEAR)…`);
  const registered = await deps.register(found.mine);
  if (!registered.ok) return { stage: "registration_failed", mine: found.mine, message: registered.message ?? "The registration did not go through.", url: registered.url ?? opened.url };
  return { stage: "done", mine: found.mine, alreadyRegistered: registered.already === true, url: registered.url ?? opened.url };
}
