import { GameCapabilitiesSchema, PublicTableSchema, type GameCapabilities, type PublicTable } from "../../domain/game/api-contracts";

const PREVIEW_TABLE_ID = "018f7f5e-7b1a-4d40-8a41-8dd5f8108f02";

const previewTable = PublicTableSchema.parse({
  id: PREVIEW_TABLE_ID,
  name: "Meme-stock showdown preview",
  mode: "preview",
  status: "OPEN",
  financialStatus: "unfunded",
  fundedPlayers: 0,
  seats: 3,
  opensUntil: "2026-09-19T13:00:00.000Z",
  startsAt: null,
  endsAt: null,
  rules: {
    playerCount: 3,
    stakeMint: "11111111111111111111111111111111",
    stakeRaw: "1000000",
    roundDurationSeconds: 900,
    scoreVersion: "kova-bps-v1",
    tieBreakVersion: "wallet-bytes-v1",
    commitmentVersion: "kova-pick-v1",
  },
  dealer: {
    required: true,
    status: "degraded",
    classificationVersion: "kova-admission-v1",
  },
});

const capabilities = GameCapabilitiesSchema.parse({
  product: "KOVA",
  stage: "m2_local_program",
  mode: "preview",
  capabilities: {
    tableDiscovery: "preview_only",
    deterministicScoring: "preview_only",
    commitmentConstruction: "preview_only",
    dealerAdmission: "blocked",
    privatePickStorage: "unavailable",
    ansemEscrow: "local_validator_only",
    settlement: "local_validator_only",
    payoutExecution: "local_validator_only",
  },
});

export function listGameTableFixtures(): readonly PublicTable[] {
  return [previewTable];
}

export function findGameTableFixture(id: string): PublicTable | undefined {
  return id === PREVIEW_TABLE_ID ? previewTable : undefined;
}

export function getGameCapabilities(): GameCapabilities {
  return capabilities;
}
