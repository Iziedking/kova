import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PlayScreen } from "@/features/near/play-screen";
import { tablePath } from "@/features/near/paths";
import { nearPageMetadata } from "../metadata";

type Props = { searchParams: Promise<{ table?: string | string[] }> };

export const metadata: Metadata = nearPageMetadata({
  path: "/play",
  title: "Play a round · Kova on NEAR",
  description: "Pick the NEAR coin you think rises most, or call a meme.cooking launch, and stake CHIP against the House or a friend. Every pot burns 10%. NEAR testnet; CHIP has no value.",
});

/** Old invites arrived as /play?table=<id>; a table now has its own page. */
export default async function NearPlayPage({ searchParams }: Props) {
  const table = (await searchParams).table;
  if (typeof table === "string" && /^\d{1,12}$/.test(table)) redirect(tablePath(table));
  return (
    <Suspense>
      <PlayScreen />
    </Suspense>
  );
}
