import { z } from "zod";

export const PublicGameEventPayloadSchema = z.object({
  status: z.string().optional(),
  financialStatus: z.string().optional(),
  fundedPlayers: z.number().int().nonnegative().optional(),
  seats: z.number().int().positive().optional(),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  message: z.string().max(240).optional(),
  chainAddress: z.string().min(32).max(44).optional(),
  opensUntil: z.iso.datetime().optional(),
  /** Published only at showdown. Before then picks stay encrypted and private. */
  results: z.array(z.object({
    wallet: z.string().min(32).max(44),
    /** The revealed pick. Absent in Trade mode, where the score is the portfolio's return. */
    mint: z.string().min(32).max(44).optional(),
    scoreBps: z.string().regex(/^-?[0-9]+$/),
    awardRaw: z.string().regex(/^[0-9]+$/),
    startPrice18: z.string().regex(/^[0-9]+$/).optional(),
    endPrice18: z.string().regex(/^[0-9]+$/).optional(),
  }).strict()).max(6).optional(),
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

