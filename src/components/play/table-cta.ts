import type { PublicTableSummary, TableViewerState } from "@/types/competition";

export type TableCta = { label: string; kind: "join" | "watch" | "return" | "result" | "none" };

/**
 * Blueprint 5.2: Open -> Join, Live -> Watch, the viewer's own live table ->
 * Return. A full open table can only be watched.
 */
export function tableCta(table: PublicTableSummary, viewerState: TableViewerState = "none"): TableCta {
  const inTable = viewerState === "joined" || viewerState === "owner";
  if (table.status === "cancelled") return { label: "Cancelled", kind: "none" };
  if (table.status === "settled") return { label: "View result", kind: "result" };
  if (inTable) return { label: "Return", kind: "return" };
  if (table.status === "open" && table.filledSeats < table.maxPlayers) return { label: "Join Table", kind: "join" };
  return { label: "Watch", kind: "watch" };
}
