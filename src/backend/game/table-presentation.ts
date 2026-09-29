import { PublicGameEventPayloadSchema, type GameEventRecord } from "../../domain/game/events";

/** Do not forward arbitrary event payloads or private Dealer admission material. */
export function presentPublicEvents(events: readonly GameEventRecord[]) {
  const messages: Record<string, string> = {
    "table.opened": "The staking window opened.",
    "table.funded": "A player funded their seat.",
    "table.active": "The round is live.",
    "table.settled": "The round settled. Results are available.",
    "table.refundable": "The table is refundable.",
    "table.expired": "The table expired.",
  };
  return events.flatMap((event) => {
    if (event.audience !== "public" || !Object.hasOwn(messages, event.eventType)) return [];
    const parsed = PublicGameEventPayloadSchema.safeParse(event.payload);
    if (!parsed.success) return [];
    return [{ id: event.sequence, at: event.createdAt, kind: "status" as const, text: parsed.data.message ?? messages[event.eventType]! }];
  }).slice(-30);
}
