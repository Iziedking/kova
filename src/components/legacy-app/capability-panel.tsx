import { getCapabilities } from "@/application/capabilities";
import { describeCapability, labelCapability } from "@/design/capability-view";

type Tone = "ok" | "warn" | "off";

const TONE_COLOUR: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", off: "text-faint" };

// Status is carried by a symbol and a word, never by colour alone.
const TONE_SYMBOL: Record<Tone, string> = { ok: "+", warn: "!", off: "x" };

export function CapabilityPanel() {
  const { capabilities, stage, mode } = getCapabilities();

  return (
    <section aria-labelledby="capability-title" className="rounded-xl border border-line bg-surface p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
        <div>
          <span className="mb-1 block font-mono text-[11px] tracking-[0.18em] text-accent">
            {"/// CAPABILITY BOUNDARY"}
          </span>
          <h2 id="capability-title" className="font-display text-xl font-bold text-ink">
            What is on and off today
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
          {mode} · {stage}
        </span>
      </div>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {Object.entries(capabilities).map(([key, value]) => {
          const view = describeCapability(value);
          return (
            <div key={key} className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2">
              <dt className="text-sm text-muted">{labelCapability(key)}</dt>
              <dd className={`shrink-0 font-mono text-[11px] tracking-[0.06em] ${TONE_COLOUR[view.tone]}`}>
                <span aria-hidden="true" className="mr-1.5">
                  {TONE_SYMBOL[view.tone]}
                </span>
                {view.label}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        This panel reports the application&rsquo;s own capability response, not a roadmap. Signing,
        transaction preparation and automated rebalancing are disabled, and your wallet remains the
        only authority over your capital.
      </p>
    </section>
  );
}
