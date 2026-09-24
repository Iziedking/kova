/**
 * The real (non-fixture) service implementation.
 *
 * Connected today: table discovery, table detail, capabilities, table draft
 * creation and invitations - the routes in `docs/game-api.md`.
 *
 * Everything else returns `PENDING_INTEGRATION` naming the missing backend
 * capability. Do not replace those with placeholder data: when the backend
 * lands, implement the method here and the screen needs no change.
 */
import { z } from "zod";
import { GameCapabilitiesSchema, PublicTableSchema } from "@/domain/game/api-contracts";
import { toCapabilityStates, toTableDetail, toTableSummary } from "@/services/adapters/game-table";
import type { KovaServices, TableQuery } from "@/services/contracts";
import { apiRequest } from "@/services/api/http";
import { fail, ok, pending, type ServiceContext } from "@/types/service";
import type { CreateTableInput } from "@/types/competition";
import { ANSEM_DECIMALS } from "@/lib/format";

const TablesResponse = z.object({ ok: z.literal(true), tables: z.array(PublicTableSchema) });
const TableResponse = z.object({ ok: z.literal(true), serverTime: z.string(), table: PublicTableSchema });
const CreatedResponse = z.object({ ok: z.literal(true), table: z.object({ id: z.string() }).passthrough() });
const ClaimResponse = z.object({ ok: z.literal(true), tableId: z.string() });
const InvitationResponse = z.object({
  ok: z.literal(true),
  invitation: z.object({ token: z.string(), expiresAt: z.string() }),
});

function stakeToRaw(stakeAnsem: number): string {
  return (BigInt(Math.round(stakeAnsem)) * 10n ** BigInt(ANSEM_DECIMALS)).toString();
}

export const apiServices: KovaServices = {
  competitions: {
    async capabilities(ctx) {
      const result = await apiRequest("/api/game/capabilities", GameCapabilitiesSchema, ctx);
      return result.ok ? ok(toCapabilityStates(result.data), "api") : result;
    },

    async listTables(query: TableQuery = {}, ctx?: ServiceContext) {
      const result = await apiRequest("/api/game/tables", TablesResponse, ctx);
      if (!result.ok) return result;
      // The backend has only a prediction game today, so a trading filter is honestly empty.
      if (query.mode === "trading") return ok([], "api");
      let tables = result.data.tables.map(toTableSummary);
      if (query.status) tables = tables.filter((table) => table.status === query.status);
      if (query.limit) tables = tables.slice(0, query.limit);
      return ok(tables, "api");
    },

    async getTable(tableId, ctx) {
      const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}`, TableResponse, ctx, { auth: false });
      return result.ok ? ok(toTableDetail(result.data.table, result.data.serverTime), "api") : result;
    },

    async createTable(input: CreateTableInput, ctx) {
      if (input.mode === "trading") {
        return pending("trading.table_creation", "Trading tables aren't open yet. Prediction tables are the first mode to go live.");
      }
      const result = await apiRequest("/api/game/tables", CreatedResponse, ctx, {
        method: "POST",
        auth: true,
        body: {
          name: input.name?.trim() || "Prediction table",
          visibility: input.visibility,
          playerCount: input.playerCount,
          stakeRaw: stakeToRaw(input.stakeAnsem),
        },
      });
      return result.ok ? ok({ tableId: result.data.table.id }, "api") : result;
    },

    async joinTable() {
      return pending("game.join", "Joining a table needs ANSEM escrow, which isn't live yet.");
    },
    async setReady() {
      return pending("game.ready", "Readiness is confirmed by funding, which isn't live yet.");
    },
    async startMatch() {
      return pending("game.start", "Starting a match needs funded seats, which isn't live yet.");
    },
    async sendChallenge() {
      return pending("social.challenges", "Direct challenges aren't connected yet.");
    },

    async createInvitation(tableId, ctx) {
      const result = await apiRequest(`/api/game/tables/${encodeURIComponent(tableId)}/invitations`, InvitationResponse, ctx, {
        method: "POST",
        auth: true,
      });
      return result.ok ? ok(result.data.invitation, "api") : result;
    },

    async claimInvitation(token, ctx) {
      const result = await apiRequest("/api/game/invitations/claim", ClaimResponse, ctx, { method: "POST", auth: true, body: { token } });
      return result.ok ? ok({ tableId: result.data.tableId }, "api") : result;
    },

    async showdown() {
      return pending("settlement.result", "Settlement isn't live yet.");
    },
  },

  prediction: {
    async viewerState() {
      return pending("prediction.private_state");
    },
    async validatePick() {
      return pending("prediction.dealer_admission", "The Dealer isn't admitting picks yet.");
    },
    async lockPick() {
      return pending("prediction.pick_submission", "Locking a pick needs a wallet proof and the Dealer, which aren't live yet.");
    },
  },

  markets: {
    async list() {
      return pending("markets.feed", "The market feed isn't connected yet.");
    },
    async memeStocks() {
      return pending("markets.clawpump_feed", "The ClawPump / pump.fun meme-stock feed isn't connected yet.");
    },
    async getByMint() {
      return pending("markets.asset", "Market details aren't connected yet.");
    },
    async candles() {
      return pending("markets.candles", "Price history isn't connected yet.");
    },
    async recentTrades() {
      return pending("markets.trades", "Recent trades aren't connected yet.");
    },
  },

  social: {
    async hotPlayers() {
      return pending("social.rankings");
    },
    async recentShowdowns() {
      return pending("social.showdowns");
    },
    async leaderboard() {
      return pending("social.rankings");
    },
    async profile() {
      return pending("social.profiles");
    },
    async history() {
      return pending("social.history");
    },
  },

  trading: {
    async matchState() {
      return pending("trading.match_state", "Trading Mode isn't live yet.");
    },
    async quote() {
      return pending("trading.quotes", "Trade quotes aren't available yet.");
    },
    async execute() {
      return pending("trading.execution", "Real trade execution isn't live yet. Nothing was sent.");
    },
    async status() {
      return pending("trading.execution");
    },
  },

  portfolio: {
    async summary() {
      return pending("portfolio.summary", "Portfolio data isn't connected yet.");
    },
  },

  profile: {
    async usernameAvailability() {
      return ok({ available: "unknown" as const }, "api");
    },
    async saveIdentity() {
      return pending("profile.identity", "Profiles aren't saved to Kova yet.");
    },
    async loadIdentity() {
      return fail({ code: "PENDING_INTEGRATION", capability: "profile.identity", retryable: false, message: "Profiles aren't saved to Kova yet." });
    },
  },

  notifications: {
    async list() {
      return pending("notifications.feed", "Notifications aren't connected yet.");
    },
  },
};
