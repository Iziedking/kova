import type { Metadata } from "next";
import { PlayScreen } from "@/features/near/play-screen";
import { nearPageMetadata } from "../metadata";

type Props = { searchParams: Promise<{ table?: string | string[] }> };

/** A friend's invite arrives as ?table=<id>; anything else is ignored. */
function inviteId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^\d{1,12}$/.test(value) ? value : null;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const table = inviteId((await searchParams).table);
  if (table) {
    // An old ?table= invite: the table's own link is its canonical address.
    return nearPageMetadata({
      path: `/t/${table}`,
      title: `Join table ${table} · Kova on NEAR`,
      description: "A friend saved you a seat. Pick the NEAR coin you think rises most; the best move takes the pot and 10% of it burns. NEAR testnet; CHIP has no value.",
    });
  }
  return nearPageMetadata({
    path: "/play",
    title: "Play the House · Kova on NEAR",
    description: "Stake CHIP against the House in a 60-second round. Every pot burns 10% of itself. NEAR testnet; CHIP has no value.",
  });
}

export default async function NearPlayPage({ searchParams }: Props) {
  return <PlayScreen invite={inviteId((await searchParams).table)} />;
}
