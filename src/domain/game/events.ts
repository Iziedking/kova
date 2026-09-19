import { z } from "zod";

export const PublicGameEventPayloadSchema = z.object({
  status: z.string().optional(),
  financialStatus: z.string().optional(),
  fundedPlayers: z.number().int().nonnegative().optional(),
  seats: z.number().int().positive().optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  message: z.string().max(240).optional(),
}).strict();

export interface GameEventRecord {
  sequence: string;
  tableId: string;
  audience: "public" | "principal";
  principalId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

