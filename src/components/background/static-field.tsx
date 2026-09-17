/** Static dot grid for app surfaces. No animation, no pointer tracking. Spec 6.2. */
export function StaticField({ className = "" }: { className?: string }) {
  return <div className={`kova-dot-field pointer-events-none absolute inset-0 ${className}`} aria-hidden="true" />;
}
