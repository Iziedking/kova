import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NearHeader } from "@/features/near/near-header";
import { NearSessionProvider } from "@/features/near/near-session";

const NEAR_DESCRIPTION = "Poker for NEAR memecoins. Stake CHIP, beat the House or a friend, and every pot burns part of the supply. NEAR testnet; CHIP has no value.";

export const metadata: Metadata = {
  // Share cards and links resolve against the NEAR host, not kova.surf.
  metadataBase: new URL("https://near.kova.surf"),
  title: "Kova on NEAR: CHIP, the chip that burns",
  description: NEAR_DESCRIPTION,
  // Without these, NEAR pages would inherit kova.surf's Solana share text from the root layout.
  openGraph: { type: "website", siteName: "Kova on NEAR", title: "Kova on NEAR: CHIP, the chip that burns", description: NEAR_DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Kova on NEAR: CHIP, the chip that burns", description: NEAR_DESCRIPTION },
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
