export function PageTitle({ kicker, title, lede }: { kicker: string; title: string; lede?: string }) {
  return (
    <div className="mb-12">
      <span className="mb-3 block font-mono text-[11px] tracking-[0.18em] text-accent">{kicker}</span>
      <h1 className="font-display text-4xl font-bold leading-tight text-ink md:text-5xl">{title}</h1>
      {lede ? <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted">{lede}</p> : null}
    </div>
  );
}
