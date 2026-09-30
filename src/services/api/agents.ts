/** The signed-in player's own AI agents. Every call needs a session. */
import { z } from "zod";
import { apiRequest } from "@/services/api/http";
import { fail, ok, type ServiceContext, type ServiceResult } from "@/types/service";
import type { AgentList, CreatedAgent } from "@/types/agents";

const AgentSchema = z.object({
  id: z.string(), name: z.string(), username: z.string(), keyPrefix: z.string(), vaultWallet: z.string(),
  createdAt: z.string(), lastUsedAt: z.string().nullable(), revokedAt: z.string().nullable(),
  balances: z.object({ ansemRaw: z.string().nullable(), lamports: z.number().nullable() }).nullable().optional(),
});
const ListSchema = z.object({
  ok: z.literal(true),
  agents: z.array(AgentSchema),
  limits: z.object({ agentsPerOwner: z.number(), maxStakeRaw: z.string(), maxOpenTables: z.number(), maxTablesPerDay: z.number(), maxOrderEquityShare: z.number(), callsPerMinute: z.number() }),
  skillUrl: z.string(),
});
const CreateSchema = z.object({ ok: z.literal(true), agent: AgentSchema, apiKey: z.string(), funded: z.boolean(), skillUrl: z.string() });
const RevokeSchema = z.object({ ok: z.literal(true) });

const needSession = async (ctx: ServiceContext | undefined) => ((await ctx?.getAccessToken?.()) ?? null) !== null;
const signIn = () => fail<never>({ code: "AUTH_REQUIRED", message: "Sign in to manage your agents.", retryable: false });

export async function listAgents(ctx: ServiceContext | undefined): Promise<ServiceResult<AgentList>> {
  if (!(await needSession(ctx))) return signIn();
  const result = await apiRequest("/api/game/agents", ListSchema, ctx, { auth: true });
  if (!result.ok) return result;
  return ok({ agents: result.data.agents.map((agent) => ({ ...agent, balances: agent.balances ?? null })), limits: result.data.limits, skillUrl: result.data.skillUrl }, "api");
}

export async function createAgent(input: { name: string; username: string }, ctx: ServiceContext | undefined): Promise<ServiceResult<CreatedAgent>> {
  if (!(await needSession(ctx))) return signIn();
  const result = await apiRequest("/api/game/agents", CreateSchema, ctx, { method: "POST", auth: true, body: input });
  if (!result.ok) return result;
  return ok({ agent: { ...result.data.agent, balances: result.data.agent.balances ?? null }, apiKey: result.data.apiKey, funded: result.data.funded, skillUrl: result.data.skillUrl }, "api");
}

export async function revokeAgent(agentId: string, ctx: ServiceContext | undefined): Promise<ServiceResult<true>> {
  if (!(await needSession(ctx))) return signIn();
  const result = await apiRequest(`/api/game/agents/${encodeURIComponent(agentId)}/revoke`, RevokeSchema, ctx, { method: "POST", auth: true, body: {} });
  return result.ok ? ok(true, "api") : result;
}
