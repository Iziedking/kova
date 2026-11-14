import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NearHeader } from "@/features/near/near-header";
import { NearSessionProvider } from "@/features/near/near-session";
import { NEAR_DESCRIPTION, NEAR_ORIGIN, NEAR_SITE_NAME, NEAR_TITLE } from "./metadata";

export const metadata: Metadata = {
  // Share cards and links resolve against the NEAR host, not kova.surf.
  metadataBase: new URL(NEAR_ORIGIN),
  applicationName: NEAR_SITE_NAME,
  title: NEAR_TITLE,
  description: NEAR_DESCRIPTION,
  // Without these, NEAR pages (and the NEAR 404) would inherit kova.surf's share text from the root
  // layout. Each page adds its own canonical and og:url (./metadata.ts).
  openGraph: { type: "website", siteName: NEAR_SITE_NAME, title: NEAR_TITLE, description: NEAR_DESCRIPTION },
  twitter: { card: "summary_large_image", title: NEAR_TITLE, description: NEAR_DESCRIPTION },
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
      <div className="relative min-h-dvh pb-16 lg:pb-0">
        <NearHeader />
        {children}
      </div>
    </NearSessionProvider>
  );
}
