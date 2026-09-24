"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { loginHref } from "@/auth/redirect";
import { useViewer } from "@/features/auth/viewer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Client-side companion to the route protection in `src/proxy.ts`. The proxy is
 * an optimistic cookie check; this catches an expired or cleared session on a
 * page that is already open, and sends the person to sign in with the current
 * path preserved.
 */
export function AuthGuard({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const viewer = useViewer();
  const router = useRouter();

  const guest = viewer.status === "guest";
  useEffect(() => {
    if (!guest) return;
    router.replace(loginHref(`${window.location.pathname}${window.location.search}`, "expired"));
  }, [guest, router]);

  if (viewer.status === "authed") return <>{children}</>;
  if (guest) {
    return (
      <div className="mx-auto max-w-[420px] py-20 text-center">
        <p className="text-[15px] text-text-secondary">Sign in to continue.</p>
        <Button href={loginHref("/app")} className="mt-4">
          Sign in
        </Button>
      </div>
    );
  }
  return (
    <>
      {fallback ?? (
        <div className="space-y-4 py-4" aria-hidden="true">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
    </>
  );
}
