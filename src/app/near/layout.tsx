import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NearHeader } from "@/features/near/near-header";
import { NearSessionProvider } from "@/features/near/near-session";

export const metadata: Metadata = {
  title: "Kova on NEAR: CHIP, the chip that burns",
  description: "Poker for NEAR memecoins. Stake CHIP, beat the House, and every pot burns part of the supply. NEAR testnet; CHIP has no value.",
};

/**
 * NEAR mode. Served on the near.* host (and localhost for development) so kova.surf is unchanged.
 * KOVA_NEAR_ANY_HOST=true opens it on any host, for preview deployments.
 */
export default async function NearLayout({ children }: { children: ReactNode }) {
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  const allowed = host.startsWith("near.") || host.startsWith("localhost") || host.startsWith("127.0.0.1") || process.env.KOVA_NEAR_ANY_HOST === "true";
  if (!allowed) notFound();
  return (
    <NearSessionProvider>
      <div className="min-h-dvh">
        <NearHeader />
        {children}
      </div>
    </NearSessionProvider>
  );
}
