import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TableScreen } from "@/features/near/table-screen";
import { nearPageMetadata } from "../../metadata";
import { requireClassic } from "../../classic-gate";

type Props = { params: Promise<{ id: string }> };

/** A challenge link: near.kova.surf/t/<id>. Shows that table and lets a signed-in visitor take a seat. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title = `Table ${id} · Kova on NEAR`;
  const description = "Pick the NEAR coin you think rises most. The best move takes the pot, and 10% of it burns. NEAR testnet; CHIP has no value.";
  // The table draws its own card (./opengraph-image.tsx), so the shared NEAR card is not added.
  return nearPageMetadata({ path: `/t/${id}`, title, description, card: false });
}

export default async function NearTablePage({ params }: Props) {
  requireClassic();
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  return (
    <Suspense>
      <TableScreen tableId={id} />
    </Suspense>
  );
}
