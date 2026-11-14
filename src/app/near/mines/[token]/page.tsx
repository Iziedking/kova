import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MineScreen } from "@/features/near/grid/mine-screen";
import { nearPageMetadata } from "../../metadata";

type Props = { params: Promise<{ token: string }> };

/** A coin's account id: lowercase letters, digits, dots, dashes, underscores. Anything else is a 404, not a 500. */
function coinFrom(raw: string): string | null {
  let coin: string;
  try {
    coin = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(coin) ? coin : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const coin = coinFrom(token);
  return nearPageMetadata({
    path: `/mines/${token}`,
    title: `${coin ? coin.split(".")[0].toUpperCase() : "Mine"} mine · Kova on NEAR`,
    description: "Put coins on a square. Every minute one square wins and 10% of the losing coins is burned.",
    card: false,
  });
}

export default async function NearMinePage({ params }: Props) {
  const coin = coinFrom((await params).token);
  if (!coin) notFound();
  return <MineScreen token={coin} />;
}
