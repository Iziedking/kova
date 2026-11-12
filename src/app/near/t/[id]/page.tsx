import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayScreen } from "@/features/near/play-screen";

type Props = { params: Promise<{ id: string }> };

/** A challenge link: near.kova.surf/t/<id>. Shows that table and lets a signed-in visitor take a seat. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Table ${id} · Kova on NEAR`;
  const description = "Pick the NEAR coin you think rises most. The best move takes the pot, and 10% of it burns. NEAR testnet; CHIP has no value.";
  return { title, description, openGraph: { type: "website", siteName: "Kova on NEAR", title, description, url: `/t/${id}` }, twitter: { card: "summary_large_image", title, description } };
}

export default async function NearTablePage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  return <PlayScreen invite={id} />;
}
