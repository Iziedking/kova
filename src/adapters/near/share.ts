/**
 * The words a player shares after a showdown, and the X post link that carries them. Pure, so the
 * wording is tested and the same text can feed the post and the on-page card.
 */
import { formatChip } from "./chip";
import { displayAccount } from "./leaderboard";
import { marketById } from "./prices";

export type ShareSeat = { player: string; market: string | null; score_bps: number | null; award: bigint };

export const SHARE_TAGS = "Built at NEAR HACKATHON. @NEARProtocol #NEARHackathon";

export function symbolOf(market: string | null): string {
  if (!market) return "?";
  return marketById(market)?.symbol ?? market.replace(/^near:/, "").split(".")[0].replace(/-\d+$/, "").toUpperCase();
}

export function movePct(bps: number | null): string {
  if (bps === null) return "n/a";
  return `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;
}

function who(player: string, viewer: string | null, house: string): string {
  if (player === viewer) return "I";
  if (player === house) return "the House";
  return displayAccount(player);
}

const cap = (name: string) => (name === "the House" ? "The House" : name);

/** One line on the result, told from the viewer's seat when they played. */
export function resultLine(tableId: string, seats: readonly ShareSeat[], viewer: string | null, house: string): string {
  const winners = seats.filter((s) => s.award > 0n);
  const pick = (s: ShareSeat) => `${symbolOf(s.market)} ${movePct(s.score_bps)}`;
  if (winners.length > 1) {
    const names = winners.map((s) => who(s.player, viewer, house));
    return `Tie at table ${tableId} on Kova: ${names.join(" and ")} split the pot at ${movePct(winners[0].score_bps)} (${winners.map((s) => symbolOf(s.market)).join(" and ")}).`;
  }
  const winner = winners[0];
  if (!winner) return `Table ${tableId} on Kova settled.`;
  const losers = seats.filter((s) => s !== winner);
  if (seats.length === 2) {
    const loser = losers[0];
    if (winner.player === viewer) return `I beat ${who(loser.player, viewer, house)} at table ${tableId} on Kova: my ${pick(winner)} against ${pick(loser)}.`;
    if (loser.player === viewer) return `${cap(who(winner.player, viewer, house))} beat me at table ${tableId} on Kova: ${pick(winner)} against my ${pick(loser)}.`;
  }
  return `${cap(who(winner.player, viewer, house))} won table ${tableId} on Kova with ${pick(winner)} against ${seats.length - 1} ${seats.length - 1 === 1 ? "player" : "players"}.`;
}

export function burnLine(burned: bigint, supply: bigint | null): string {
  return `This pot burned ${formatChip(burned)} CHIP.${supply !== null ? ` Supply is now ${formatChip(supply)}.` : ""}`;
}

export function showdownPost(input: { tableId: string; seats: readonly ShareSeat[]; viewer: string | null; house: string; burned: bigint; supply: bigint | null }): string {
  return `${resultLine(input.tableId, input.seats, input.viewer, input.house)} ${burnLine(input.burned, input.supply)}\n\n${SHARE_TAGS}`;
}

export function invitePost(input: { tableId: string; stake: bigint; roundSeconds: number }): string {
  return `I saved you a seat at table ${input.tableId} on Kova: ${formatChip(input.stake)} CHIP, a ${input.roundSeconds} s round, best NEAR coin pick takes the pot and 10% of it burns.\n\n${SHARE_TAGS}`;
}

/** X's web intent. The link goes in its own parameter so X shows the table's preview card. */
export function xPostUrl(text: string, link: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}
