"use client";

import { useState } from "react";
import { useViewer } from "@/features/auth/viewer";
import { loadServices } from "@/services";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { InlineNotice } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { CompetitionMode } from "@/types/competition";
import {
  DURATION_PRESETS,
  MARKET_RULES,
  STAKE_BOUNDS,
  STAKE_PRESETS,
  marketRuleSummary,
  type MarketRule,
} from "./table-options";
import { TableRulesSummary } from "./table-rules-summary";

/**
 * Direct challenge (blueprint 28): mode, stake, duration and market, reviewed as
 * `Challenge @Beni / TRADE / 50 ANSEM / 15 MIN / ANY ELIGIBLE MEME STOCK`.
 * Opened from a profile, the leaderboard, Hot Players or a recent match. The
 * caller has already required a session; a challenge does not move money.
 */
export function ChallengeSheet({
  open,
  onOpenChange,
  opponent,
  initialMode = "trading",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opponent: string;
  initialMode?: CompetitionMode;
}) {
  const viewer = useViewer();
  const [mode, setMode] = useState<CompetitionMode>(initialMode);
  const [stake, setStake] = useState<number | "custom">(50);
  const [customStake, setCustomStake] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(900);
  const [marketRule, setMarketRule] = useState<MarketRule>("any");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; pending: boolean } | null>(null);

  const custom = Number(customStake);
  const stakeAnsem = stake === "custom" ? (Number.isInteger(custom) && custom >= STAKE_BOUNDS.min && custom <= STAKE_BOUNDS.max ? custom : null) : stake;
  const minutes = Math.round(durationSeconds / 60);

  async function send() {
    if (stakeAnsem === null) return;
    setSending(true);
    setError(null);
    const services = await loadServices();
    const result = await services.competitions.sendChallenge(
      { opponentUsername: opponent, mode, stakeAnsem, durationSeconds, marketRule },
      { getAccessToken: viewer.getAccessToken },
    );
    setSending(false);
    if (!result.ok) {
      setError({ message: result.error.message, pending: result.error.code === "PENDING_INTEGRATION" });
      return;
    }
    toast.success(`Challenge sent to @${opponent}`);
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!sending}
      title={`Challenge @${opponent}`}
      description="They'll get a notification and can accept to open the table."
      footer={
        <div className="space-y-3">
          {error ? <InlineNotice tone={error.pending ? "warning" : "danger"}>{error.message}</InlineNotice> : null}
          <Button block size="lg" loading={sending} loadingLabel="Sending…" disabled={stakeAnsem === null} onClick={() => void send()}>
            Send challenge
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-2 px-4 py-3">
          <PlayerAvatar username={opponent} size="md" />
          <p className="text-[15px] font-semibold text-text-primary">@{opponent}</p>
        </div>

        <ChoiceGroup
          label="Mode"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setError(null);
          }}
          size="lg"
          choices={[
            { value: "prediction", label: "Predict", hint: "Secret pick" },
            { value: "trading", label: "Trade", hint: "Real trades" },
          ]}
        />

        <div>
          <ChoiceGroup
            label="Stake (ANSEM)"
            value={stake}
            onChange={setStake}
            columns={5}
            choices={[...STAKE_PRESETS.map((amount) => ({ value: amount as number | "custom", label: String(amount) })), { value: "custom" as const, label: "Custom" }]}
          />
          {stake === "custom" ? (
            <Input
              wrapperClassName="mt-2"
              label="Custom stake"
              hideLabel
              inputMode="numeric"
              placeholder="Amount in ANSEM"
              value={customStake}
              onChange={(event) => setCustomStake(event.target.value.replace(/\D/g, ""))}
              suffix="ANSEM"
              error={customStake !== "" && stakeAnsem === null ? `Enter a whole number from ${STAKE_BOUNDS.min} to ${STAKE_BOUNDS.max.toLocaleString()}.` : null}
            />
          ) : null}
        </div>

        <ChoiceGroup
          label="Duration"
          value={durationSeconds}
          onChange={setDurationSeconds}
          choices={DURATION_PRESETS.map((preset) => ({ value: preset.seconds, label: preset.label }))}
        />

        <ChoiceGroup
          label="Market"
          value={marketRule}
          onChange={setMarketRule}
          columns={1}
          choices={MARKET_RULES.map((rule) => ({ value: rule.value, label: rule.label }))}
        />

        <TableRulesSummary
          title={`CHALLENGE @${opponent.toUpperCase()}`}
          lines={[
            mode === "trading" ? "TRADE" : "PREDICT",
            stakeAnsem === null ? "— ANSEM" : `${stakeAnsem} ANSEM`,
            durationSeconds >= 3600 ? `${durationSeconds / 3600} HR` : `${minutes} MIN`,
            marketRuleSummary(marketRule),
          ]}
        />
      </div>
    </ResponsiveOverlay>
  );
}
