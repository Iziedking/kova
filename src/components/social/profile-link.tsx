import Link from "next/link";
import type { ReactNode } from "react";

/** A wallet fallback name is display-only; it has no username route. */
export function ProfileLink({ username, hasProfile, children, className, role }: { username: string; hasProfile?: boolean; children: ReactNode; className?: string; role?: string }) {
  if (hasProfile === false) return <span role={role} className={className}>{children}</span>;
  return <Link role={role} className={className} href={"/profile/" + encodeURIComponent(username)}>{children}</Link>;
}
