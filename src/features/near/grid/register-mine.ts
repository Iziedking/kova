import { failureMessage } from "@/adapters/near/chip";
import { type GridClient, needsRegistration, registrationCall } from "@/adapters/near/grid";
import type { useNear } from "../near-session";

type Near = ReturnType<typeof useNear>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Registers a mine with its coin (NEP-145) if it is not already, then waits until the coin says so.
 * A mine cannot receive a standard coin until this is done, and it does not do it itself. The
 * caller pays the coin's minimum (0.00125 NEAR for the usual token). Never throws.
 */
export async function registerMine(near: Near, grid: GridClient, token: string, mine: string): Promise<{ ok: boolean; already?: boolean; message?: string; url?: string }> {
  try {
    const balance = await grid.storageBalance(token, mine);
    if (!needsRegistration(balance)) return { ok: true, already: true };
    const min = await grid.registrationCost(token);
    if (min === null) return { ok: true, already: true }; // no storage management: nothing to register
    const call = registrationCall({ token, mine, min });
    const result = await near.callContract(call.contractId, call.method, call.args, { gas: call.gas, deposit: call.deposit });
    if (!result.success) return { ok: false, message: failureMessage(result.failure), url: result.explorerUrl || undefined };
    // The coin is the judge: wait until it reports the mine as registered.
    for (let i = 0; i < 8; i += 1) {
      if (!needsRegistration(await grid.storageBalance(token, mine))) return { ok: true, url: result.explorerUrl };
      await sleep(1_500);
    }
    return { ok: false, message: "The registration was sent but the coin does not show it yet. Check again in a moment.", url: result.explorerUrl };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "The registration did not go through." };
  }
}
