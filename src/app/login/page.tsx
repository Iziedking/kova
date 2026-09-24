import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginPanel } from "@/components/auth/login-panel";
import { ViewerRoot } from "@/features/auth/viewer-root";
import { privyAppId } from "@/auth/privy-env";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign in · Kova",
  description: "Sign in to Kova with X, email or a Solana wallet to play, challenge and keep your record.",
};

function LoginFallback() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="mx-auto h-9 w-2/3" />
      <Skeleton className="h-[50px] w-full" />
      <Skeleton className="h-[50px] w-full" />
      <Skeleton className="h-[50px] w-full" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <ViewerRoot appId={privyAppId()}>
      <AuthShell>
        <Suspense fallback={<LoginFallback />}>
          <LoginPanel />
        </Suspense>
      </AuthShell>
    </ViewerRoot>
  );
}
