import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isClanName } from "@/adapters/near/chip";
import { ClanScreen } from "@/features/near/clan-screen";
import { nearPageMetadata } from "../../metadata";
import { requireClassic } from "../../classic-gate";

type Props = { params: Promise<{ name: string }> };

/** A clan invite link: near.kova.surf/c/<name>. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const title = `Clan ${name} · Kova on NEAR`;
  const description = "Join this clan on Kova. Every table its members play counts for it, and the top clan of the day claims a double share of CHIP's daily mint. NEAR testnet; CHIP has no value.";
  return nearPageMetadata({ path: `/c/${name}`, title, description });
}

export default async function NearClanPage({ params }: Props) {
  requireClassic();
  const { name } = await params;
  if (!isClanName(name)) notFound();
  return <ClanScreen name={name} />;
}
