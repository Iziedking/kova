"use client";

import { Tabs } from "@/components/ui/tabs";
import type { Timeframe } from "@/types/market";

const ITEMS = (["1m", "5m", "15m", "1h", "4h", "1d"] as const).map((value) => ({ value, label: value === "1d" ? "1D" : value }));

/** Chart timeframe. Deliberately separate from the competition timer. */
export function TimeframeTabs({ value, onChange }: { value: Timeframe; onChange: (value: Timeframe) => void }) {
  return <Tabs items={ITEMS} value={value as (typeof ITEMS)[number]["value"]} onValueChange={onChange} variant="pill" label="Chart timeframe" />;
}
