import { ImageResponse } from "next/og";
import { ChipClient, NEAR_NETWORKS, formatChip } from "@/adapters/near/chip";
import { CHIP_CONTRACT_ID } from "@/adapters/near/contract";
import { displayAccount } from "@/adapters/near/leaderboard";
import { burnLine, movePct, resultLine, symbolOf } from "@/adapters/near/share";
import { NearCard } from "../../near-card";

/** The card a challenge link shows on X: the open seat, or the result and the burn once settled. */
export const alt = "A CHIP table on Kova: pick the NEAR coin that rises most; every pot burns 10% of itself.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Server-side copies of the public settings (the session module is client-only).
const CONTRACT = CHIP_CONTRACT_ID;
const HOUSE = process.env.NEXT_PUBLIC_NEAR_HOUSE_ACCOUNT ?? "house.kingizie.testnet";
const NETWORK = NEAR_NETWORKS[process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet"];

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chip = new ChipClient(CONTRACT, NETWORK);
  const [table, stats] = /^\d{1,12}$/.test(id) ? await Promise.all([chip.getTable(id).catch(() => null), chip.getStats().catch(() => null)]) : [null, null];
  const footer = `near.kova.surf/t/${id}`;

  if (!table) {
    return new ImageResponse(<NearCard kicker="KOVA · ON NEAR" title={`Table ${id}`} lines={["Pick the NEAR coin you think rises most.", "Every pot burns 10% of itself."]} footer={footer} />, size);
  }
  const name = (p: string) => (p === HOUSE ? "The House" : displayAccount(p));
  if (table.status === "Settled") {
    return new ImageResponse(
      <NearCard
        kicker={`TABLE ${table.id} · SETTLED`}
        title={burnLine(table.burned, null).replace(/\.$/, "")}
        lines={[
          resultLine(table.id, table.players, null, HOUSE),
          table.players.map((p) => `${name(p.player)} ${symbolOf(p.market)} ${movePct(p.score_bps)}`).join("  ·  "),
          stats ? `CHIP supply is now ${formatChip(stats.total_supply)}` : "",
        ].filter(Boolean)}
        footer={footer}
      />,
      size,
    );
  }
  const seatsLeft = table.seats - table.players.length;
  return new ImageResponse(
    <NearCard
      kicker={`TABLE ${table.id} · ${table.status === "Open" && seatsLeft > 0 ? `${seatsLeft} ${seatsLeft === 1 ? "SEAT" : "SEATS"} OPEN` : table.status.toUpperCase()}`}
      title={`${formatChip(table.stake)} CHIP · ${table.round_seconds} s round`}
      lines={[`Hosted by ${name(table.host)} · ${table.players.length} of ${table.seats} seated`, "Pick the NEAR coin that rises most. The best move takes the pot; 10% of it burns."]}
      footer={footer}
    />,
    size,
  );
}
