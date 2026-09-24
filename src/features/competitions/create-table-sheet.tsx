"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useViewer } from "@/features/auth/viewer";
import { loadServices } from "@/services";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/ui/overlay";
import { InlineNotice } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { CompetitionMode, CreateTableInput, TableVisibility } from "@/types/competition";
import {
  DURATION_PRESETS,
  MARKET_RULES,
  PLAYER_COUNTS,
  STAKE_BOUNDS,
  STAKE_PRESETS,
  durationLabel,
  marketRuleSummary,
  modeTitle,
  type MarketRule,
} from "./table-options";
import { TableRulesSummary } from "./table-rules-summary";

interface FormState {
  mode: CompetitionMode;
  visibility: TableVisibility;
  stake: number | "custom";
  customStake: string;
  durationSeconds: number;
  playerCount: number;
  marketRule: MarketRule;
  marketMint: string | null;
}

const INITIAL: FormState = {
  mode: "prediction",
  visibility: "public",
  stake: 50,
  customStake: "",
  durationSeconds: 900,
  playerCount: 2,
  marketRule: "any",
  marketMint: null,
};

function stakeValue(form: FormState): number | null {
  if (form.stake !== "custom") return form.stake;
  const parsed = Number(form.customStake);
  return Number.isInteger(parsed) && parsed >= STAKE_BOUNDS.min && parsed <= STAKE_BOUNDS.max ? parsed : null;
}

/**
 * Create Table (blueprint section 10): mode, visibility, stake, duration,
 * players and, behind Advanced, the market rule. Retains its state on failure
 * and shows the reason. Creating a table does not move money - staking happens
 * when a seat is funded - so no wallet is requested here.
 */
export function CreateTableSheet({
  open,
  onOpenChange,
  initialMode = "prediction",
  initialMarket = null,
  initialVisibility = "public",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: CompetitionMode;
  /** Start from a specific market (from a market page's "Play this market"). */
  initialMarket?: { mint: string; symbol: string } | null;
  initialVisibility?: TableVisibility;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const [form, setForm] = useState<FormState>({
    ...INITIAL,
    mode: initialMode,
    visibility: initialVisibility,
    ...(initialMarket ? { marketRule: "specific" as const, marketMint: initialMarket.mint } : {}),
  });
  const [advanced, setAdvanced] = useState(initialMarket !== null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; pending: boolean } | null>(null);

  const stake = stakeValue(form);
  const customInvalid = form.stake === "custom" && form.customStake !== "" && stake === null;

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
    setError(null);
  }

  async function submit() {
    if (stake === null) return;
    setSubmitting(true);
    setError(null);
    const input: CreateTableInput = {
      mode: form.mode,
      visibility: form.visibility,
      stakeAnsem: stake,
      durationSeconds: form.durationSeconds,
      playerCount: form.playerCount,
      marketRule: form.marketRule,
      marketMint: form.marketRule === "specific" ? form.marketMint : null,
      name: `${form.mode === "prediction" ? "Prediction" : "Trading"} · ${stake} ANSEM`,
    };
    const services = await loadServices();
    const result = await services.competitions.createTable(input, { getAccessToken: viewer.getAccessToken });
    setSubmitting(false);
    if (!result.ok) {
      setError({ message: result.error.message, pending: result.error.code === "PENDING_INTEGRATION" });
      return;
    }
    toast.success("Table created");
    onOpenChange(false);
    router.push(`/tables/${encodeURIComponent(result.data.tableId)}`);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!submitting}
      title="Create table"
      description="Set the stakes, invite players, then play."
      footer={
        <div className="space-y-3">
          {error ? (
            <InlineNotice tone={error.pending ? "warning" : "danger"}>{error.message}</InlineNotice>
          ) : null}
          <Button block size="lg" loading={submitting} loadingLabel="Creating…" disabled={stake === null} onClick={() => void submit()}>
            Create table
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <ChoiceGroup
          label="Mode"
          value={form.mode}
          onChange={(mode) => patch({ mode })}
          size="lg"
          choices={[
            { value: "prediction", label: "Predict", hint: "Secret pick" },
            { value: "trading", label: "Trade", hint: "Real trades" },
          ]}
        />
        <ChoiceGroup
          label="Visibility"
          value={form.visibility}
          onChange={(visibility) => patch({ visibility })}
          choices={[
            { value: "public", label: "Public" },
            { value: "private", label: "Private" },
          ]}
        />

        <div>
          <ChoiceGroup
            label="Stake (ANSEM)"
            value={form.stake}
            onChange={(next) => patch({ stake: next })}
            columns={5}
            choices={[...STAKE_PRESETS.map((amount) => ({ value: amount as number | "custom", label: String(amount) })), { value: "custom" as const, label: "Custom" }]}
          />
          {form.stake === "custom" ? (
            <Input
              wrapperClassName="mt-2"
              label="Custom stake"
              hideLabel
              inputMode="numeric"
              placeholder="Amount in ANSEM"
              value={form.customStake}
              onChange={(event) => patch({ customStake: event.target.value.replace(/\D/g, "") })}
              suffix="ANSEM"
              error={customInvalid ? `Enter a whole number from ${STAKE_BOUNDS.min} to ${STAKE_BOUNDS.max.toLocaleString()}.` : null}
            />
          ) : null}
        </div>

        <ChoiceGroup
          label="Duration"
          value={form.durationSeconds}
          onChange={(durationSeconds) => patch({ durationSeconds })}
          choices={DURATION_PRESETS.map((preset) => ({ value: preset.seconds, label: preset.label }))}
        />
        <ChoiceGroup
          label="Players"
          value={form.playerCount}
          onChange={(playerCount) => patch({ playerCount })}
          choices={PLAYER_COUNTS.map((count) => ({ value: count, label: String(count) }))}
        />

        <div>
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((value) => !value)}
            className="flex w-full items-center justify-between rounded-lg py-1 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Advanced
            <ChevronDown size={16} className={cn("transition-transform", advanced && "rotate-180")} aria-hidden="true" />
          </button>
          {advanced ? (
            <ChoiceGroup
              className="mt-2"
              label="Market rules"
              value={form.marketRule}
              onChange={(marketRule) => patch({ marketRule })}
              columns={1}
              choices={MARKET_RULES.map((rule) => ({ value: rule.value, label: rule.label }))}
            />
          ) : null}
        </div>

        <TableRulesSummary
          title={modeTitle(form.mode, form.playerCount)}
          lines={[
            stake === null ? "— ANSEM" : `${stake} ANSEM`,
            durationLabel(form.durationSeconds),
            `${form.playerCount} PLAYERS`,
            form.marketRule === "specific" && initialMarket ? `SPECIFIC MARKET · $${initialMarket.symbol}` : marketRuleSummary(form.marketRule),
          ]}
        />
      </div>
    </ResponsiveOverlay>
  );
}
