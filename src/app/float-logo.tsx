export function KovaLogo() {
  return <div className="float-logo" aria-label="KOVA">
    <svg className="float-logo-mark" viewBox="0 0 80 64" role="img" aria-hidden="true">
      <path className="logo-stroke logo-stroke-main" d="M10 54V10h38M10 31h29" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" />
      <path className="logo-stroke logo-stroke-orbit" d="M43 8c15-4 28 6 30 20 3 15-7 28-21 32-8 2-16 0-23-4" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <path className="logo-stroke logo-stroke-orbit logo-stroke-orbit-two" d="M49 12c10 0 18 7 19 16" fill="none" stroke="var(--campaign-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="43" cy="8" r="3" fill="var(--campaign-accent)" />
    </svg>
    <span className="float-logo-type">KOVA</span>
  </div>;
}
