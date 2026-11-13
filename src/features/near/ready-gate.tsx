"use client";

/**
 * Getting set up, as one card that shows only the next step: sign in, turn on the game key, or
 * claim the starter chips. It disappears once the player can play, so the page under it is about
 * the round and nothing else. The full account details live on /account.
 */
import { Coins, KeyRound } from "lucide-react";
import { useState } from "react";
import { failureMessage } from "@/adapters/near/chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/section";
import { InlineNotice } from "@/components/ui/states";
import { SignInChoice } from "./sign-in-choice";
import { usePlayer } from "./use-player";

const STEP_TITLE = {
  sign_in: "Sign in to play",
  game_key: "One approval and you are ready",
  claim: "Get your 1,000 CHIP",
} as const;

export function ReadyGate({ purpose = "play" }: { purpose?: string }) {
  const player = usePlayer();
  const { near } = player;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (player.step === "ready" || near.status === "loading" && !near.progress) return null;

  async function enable() {
    setBusy(true);
    setError(null);
    const result = await near.enableGameKey(!player.starterClaimed);
    setBusy(false);
    if (!result.ok) setError(near.method === "email" ? `The game key was not added: ${result.message}` : `The wallet did not approve: ${result.message}`);
    await player.refresh();
  }

  async function claim() {
    setBusy(true);
    setError(null);
    const result = await near.call("claim_starter", {});
    setBusy(false);
    if (!result.success) setError(failureMessage(result.failure));
    await player.refresh();
  }

  const step = player.step;
  return (
    <Card className="kova-edge space-y-3 p-5" as="section" aria-labelledby="ready-gate-title">
      <div>
        <p id="ready-gate-title" className="text-[16px] font-semibold text-text-primary">
          {STEP_TITLE[step]}
        </p>
        <p className="mt-1 text-[13px] text-text-secondary">
          {step === "sign_in"
            ? `Use a NEAR testnet wallet${near.emailAvailable ? " or your email" : ""} to ${purpose}. CHIP is a testnet token with no value.`
            : step === "game_key"
              ? "This adds a key that can only call CHIP's game methods, with at most 0.25 NEAR of gas. It cannot move your NEAR or CHIP. After it, playing needs no popups."
              : "The contract gives every new player 1,000 CHIP, once."}
        </p>
      </div>
      {step === "sign_in" ? <SignInChoice compact /> : null}
      {step === "game_key" ? (
        <Button iconLeft={<KeyRound size={16} />} onClick={() => void enable()} loading={busy || near.keyState === "pending"} loadingLabel={near.method === "email" ? "Adding the key…" : "Waiting for your wallet…"}>
          {player.starterClaimed ? "Turn on the game key" : "Approve once and get 1,000 CHIP"}
        </Button>
      ) : null}
      {step === "claim" ? (
        <Button iconLeft={<Coins size={16} />} onClick={() => void claim()} loading={busy} loadingLabel="Claiming…">
          Get 1,000 CHIP
        </Button>
      ) : null}
      {error ?? near.error ? <InlineNotice tone="danger">{error ?? near.error}</InlineNotice> : null}
    </Card>
  );
}
