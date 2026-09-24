/** The pre-submit rules block: `TRADING DUEL / 50 ANSEM / 15 MINUTES / ...` (blueprint 10, 28). */
export function TableRulesSummary({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-2 px-4 py-3.5" aria-label="Table summary">
      <p className="text-[12px] font-semibold tracking-[0.14em] text-[#b79bff]">{title}</p>
      <ul className="mt-2 space-y-1">
        {lines.map((line) => (
          <li key={line} className="num text-[13px] font-medium tracking-[0.06em] text-text-primary">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
