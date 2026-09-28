/**
 * Maps the backend's prediction-only `PublicTable` (src/domain/game/api-contracts.ts)
 * to the frontend competition contracts.
 *
 * The backend does not yet supply player identities, a trading mode, market
 * labels, standings or an activity feed. Those fields stay null or empty here so
 * the UI shows an honest state rather than an invented one.
 */
import type { GameCapabilities, PublicTable } from "@/domain/game/api-contracts";
import type { z } from "zod";
import type { TableViewerSchema } from "@/domain/game/api-contracts";

type TableViewer = z.infer<typeof TableViewerSchema>;
import type {
  GameCapabilityState,
  PublicTableSummary,
  TableDetail,
  TableSeat,
  TableStatus,
} from "@/types/competition";

const STATUS_MAP: Record<PublicTable["status"], TableStatus> = {
  // A DRAFT table is a lobby: open to players, not yet on chain (it opens at the first stake).
  DRAFT: "open",
  OPEN: "open",
  LOCKING: "waiting",
  ACTIVE: "active",
  SETTLING: "settling",
  SETTLED: "settled",
  CANCELLED: "cancelled",
  VOIDED: "cancelled",
};

export function mapTableStatus(status: PublicTable["status"]): TableStatus {
  return STATUS_MAP[status];
}

/** `stakeRaw * fundedPlayers`, in raw units. Null when the stake is not a canonical integer. */
export function potRaw(stakeRaw: string, fundedPlayers: number): string | null {
  if (!/^(0|[1-9][0-9]*)$/.test(stakeRaw)) return null;
  return (BigInt(stakeRaw) * BigInt(fundedPlayers)).toString();
}

export function toTableSummary(table: PublicTable): PublicTableSummary {
  return {
    id: table.id,
    name: table.name,
    mode: "prediction",
    status: mapTableStatus(table.status),
    // The public list only returns public tables; a table read by its host or an invitee says which it is.
    visibility: table.visibility ?? "public",
    stakeAnsemRaw: table.rules.stakeRaw,
    potAnsemRaw: potRaw(table.rules.stakeRaw, table.fundedPlayers),
    durationSeconds: table.rules.roundDurationSeconds,
    startsAt: table.startsAt,
    endsAt: table.endsAt,
    opensUntil: table.opensUntil,
    lobby: table.status === "DRAFT",
    players: [],
    filledSeats: table.fundedPlayers,
    maxPlayers: table.seats,
    marketLabel: null,
    tagline: null,
  };
}

function seatsFor(table: PublicTable): TableSeat[] {
  return Array.from({ length: table.seats }, (_, index) => ({
    seat: index + 1,
    player: null,
    readiness: index < table.fundedPlayers ? "funded" : "empty",
    isViewer: false,
  }));
}

export function toTableDetail(table: PublicTable, serverTime: string, viewer: TableViewer | null = null, seatedThisSession = false): TableDetail {
  const viewerState = viewer?.isHost ? "owner" : viewer?.participant || seatedThisSession ? "joined" : "none";
  return {
    ...toTableSummary(table),
    seats: seatsFor(table),
    viewerState,
    standings: null,
    dealer: [],
    activity: [],
    serverTime,
    dealerStatus: table.dealer.status,
    financialStatus: table.financialStatus,
  };
}

const CAPABILITY_LABELS: Record<keyof GameCapabilities["capabilities"], string> = {
  tableDiscovery: "Table discovery",
  deterministicScoring: "Scoring",
  commitmentConstruction: "Pick commitments",
  dealerAdmission: "Dealer admission",
  privatePickStorage: "Private pick storage",
  ansemEscrow: "ANSEM escrow",
  settlement: "Settlement",
  payoutExecution: "Payouts",
};

export function toCapabilityStates(capabilities: GameCapabilities): GameCapabilityState[] {
  return (Object.keys(CAPABILITY_LABELS) as Array<keyof typeof CAPABILITY_LABELS>).map((key) => ({
    key,
    label: CAPABILITY_LABELS[key],
    state: capabilities.capabilities[key],
  }));
}
