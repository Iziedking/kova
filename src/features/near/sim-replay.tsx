"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Replay = { simulated: true; seed: number; scenarios: { key: string; name: string; supply: number[]; treasury: number[]; targetMet: boolean[] }[] };

const DAY_MS = 500; // 60 days in 30 seconds

/**
 * Fast-forward: replays the 60-day simulation day by day for one scenario. Simulated data from
 * scripts/near/chip-simulation.ts, never mixed with the live numbers.
 */
export function SimReplay() {
  const [data, setData] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState("busy");
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    fetch("/near/chip-replay.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Replay) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setDay((d) => {
        if (d >= 59) {
          setPlaying(false);
          return 59;
        }
        return d + 1;
      });
    }, DAY_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing]);

  if (error) return <p className="text-[13px] text-warning">Simulation replay unavailable: {error}</p>;
  if (!data) return <p className="text-[13px] text-text-muted">Loading the simulation…</p>;

  const s = data.scenarios.find((x) => x.key === scenario) ?? data.scenarios[0];
  const start = s.supply[0];
  const now = s.supply[day];
  const change = ((now - start) / start) * 100;
  const max = Math.max(...s.supply, ...s.treasury);
  const width = 600;
  const height = 160;
  const path = (values: number[]) =>
    values
      .slice(0, day + 1)
      .map((v, i) => `${i === 0 ? "M" : "L"}${((i / 59) * width).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
      .join(" ");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Scenario" className="flex flex-wrap gap-1.5">
          {data.scenarios.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={scenario === x.key}
              onClick={() => {
                setScenario(x.key);
                setDay(0);
                setPlaying(false);
              }}
              className={cn("h-9 rounded-lg border px-3 text-[12px] font-medium", scenario === x.key ? "border-accent bg-accent-soft text-text-primary" : "border-border-subtle text-text-secondary")}
            >
              {x.name}
            </button>
          ))}
        </div>
        <Badge tone="warning">Simulated, not live</Badge>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-[12px] text-text-muted">Simulated day</p>
          <p className="num text-[28px] font-bold text-text-primary">{day + 1} / 60</p>
        </div>
        <div>
          <p className="text-[12px] text-text-muted">Simulated supply</p>
          <p className="num text-[28px] font-bold text-text-primary">{Math.round(now).toLocaleString("en-US")}</p>
        </div>
        <div>
          <p className="text-[12px] text-text-muted">Since day 1</p>
          <p className={cn("num text-[28px] font-bold", change < 0 ? "text-danger" : "text-success")}>
            {change > 0 ? "+" : ""}
            {change.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[12px] text-text-muted">That day&apos;s call</p>
          <p className={cn("text-[16px] font-semibold", s.targetMet[day] ? "text-success" : "text-danger")}>{s.targetMet[day] ? "Target met: mint" : "Target missed: burn"}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-40 w-full" role="img" aria-label={`Simulated supply and treasury for ${s.name}, up to day ${day + 1}`}>
        <path d={path(s.supply)} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
        <path d={path(s.treasury)} fill="none" stroke="var(--color-text-muted)" strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />
      </svg>
      <p className="mt-1 text-[11px] text-text-muted">Solid: total supply. Dashed: treasury.</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" iconLeft={playing ? <Pause size={14} /> : <Play size={14} />} onClick={() => (day >= 59 ? (setDay(0), setPlaying(true)) : setPlaying((p) => !p))}>
          {playing ? "Pause" : day >= 59 ? "Replay" : "Fast-forward 60 days"}
        </Button>
        <Button size="sm" variant="ghost" iconLeft={<RotateCcw size={14} />} onClick={() => (setPlaying(false), setDay(0))}>
          Reset
        </Button>
      </div>
    </div>
  );
}
