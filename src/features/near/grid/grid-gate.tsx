"use client";

/**
 * Getting set up for Kova v3, as one card that shows only the next step: sign in, turn on the game
 * key (one approval, which also claims the starter CHIP), or claim. It disappears once the player
 * can stake CHIP. The game key can only call CHIP's `mine_deploy` and `claim_starter`, so it cannot
 * move NEAR or CHIP; it lives only in this browser.
 */
import { Coins, KeyRound } from "lucide-react";
import { useState } from "react";
import { failureMessage } from "@/adapters/near/chip";
import { GAS, GRID_CHIP } from "@/adapters/near/grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { SignInChoice } from "../sign-in-choice";
import { useGridPlayer } from "./use-grid";

const TITLE = { sign_in: "Sign in to mine", game_key: "One approval and you are ready", claim: "Get your 1,000 CHIP" } as const;

export function GridGate() {
  const player = useGridPlayer();
  const { near } = player;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (player.step === "ready" || (near.status === "loading" && !near.progress)) return null;
  const step = player.step;

  async function enable() {
    setBusy(true);
    setError(null);
    const result = await near.enableGridKey(!player.starterClaimed);
    setBusy(false);
    if (!result.ok) setError(near.method === "email" ? `The game key was not added: ${result.message}` : `The wallet did not approve: ${result.message}`);
    player.refresh();
  }

  async function claim() {
    setBusy(true);
    setError(null);
    const result = await near.callContract(GRID_CHIP, "claim_starter", {}, { gas: GAS.claimStarter });
    setBusy(false);
    if (!result.success) setError(failureMessage(result.failure));
    player.refresh();
  }

  return (
    <Card className="kova-edge space-y-3 p-5" as="section">
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary">{TITLE[step]}</h2>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">
          {step === "sign_in"
            ? `Use a NEAR testnet wallet${near.emailAvailable ? " or your email" : ""}. CHIP and the test coins have no value.`
            : step === "game_key"
              ? "This adds a key that can only stake CHIP in a mine and claim the starter CHIP, with at most 0.25 NEAR of gas. It cannot move your NEAR or CHIP. After it, staking CHIP needs no popups."
              : "The contract gives every new account 1,000 CHIP once. It is testnet only."}
        </p>
      </div>
      {step === "sign_in" ? <SignInChoice compact /> : null}
      {step === "game_key" ? (
        <Button iconLeft={<KeyRound size={16} />} onClick={() => void enable()} loading={busy || near.gridKeyState === "pending"} loadingLabel={near.method === "email" ? "Adding the key…" : "Waiting for your wallet…"}>
          {player.starterClaimed ? "Turn on the game key" : "Approve once and get 1,000 CHIP"}
        </Button>
      ) : null}
      {step === "claim" ? (
        <Button iconLeft={<Coins size={16} />} onClick={() => void claim()} loading={busy} loadingLabel="Claiming…">
          Get 1,000 CHIP
        </Button>
      ) : null}
      {(error ?? near.error) ? <InlineNotice tone="danger">{error ?? near.error}</InlineNotice> : null}
    </Card>
  );
}
