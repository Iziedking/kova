import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { AgentAwareAuth, AgentService, AGENT_LIMITS } from "../../src/backend/game/agents";
import { parseAnsem } from "../../src/backend/game/agent-routes";
import { agentSkillText } from "../../src/backend/game/agent-skill";
import type { GameRepository } from "../../src/backend/game/repository";
import type { PickKeyring } from "../../src/backend/game/pick-crypto";

const service = () => new AgentService({ pool: {} as Pool, repository: {} as GameRepository, keyring: {} as PickKeyring, origin: "https://kova.surf", connection: null, stakeMint: null });

test("stake amounts parse to exact raw units and refuse anything malformed", () => {
  assert.equal(parseAnsem("1"), 1_000_000n);
  assert.equal(parseAnsem("0.5"), 500_000n);
  assert.equal(parseAnsem("2.000001"), 2_000_001n);
  for (const bad of [undefined, "", "0", "-1", "1e3", "1.0000001", "abc", "1000"]) assert.equal(parseAnsem(bad), null, String(bad));
});

test("player routes accept a one-call internal token but never a raw agent key", async () => {
  const agents = service();
  const auth = new AgentAwareAuth({ verifyBearer: async (token) => (token === "privy-token" ? { privyUserId: "did:privy:user" } : null) }, agents);
  assert.deepEqual(await auth.verifyBearer("privy-token"), { privyUserId: "did:privy:user" });
  assert.equal(await auth.verifyBearer("kova_agent_anything"), null);
  const { token, release } = agents.issueInternalToken("agent-1");
  assert.deepEqual(await auth.verifyBearer(token), { privyUserId: "agent:agent-1" });
  release();
  assert.equal(await auth.verifyBearer(token), null, "a released token is gone");
  assert.equal(await auth.verifyBearer("kova_internal_forged"), null);
  assert.equal(await auth.linkedX("agent:agent-1"), null, "agents never have an X account");
});

test("each agent gets its own per-minute call budget", () => {
  const agents = service();
  const now = 1_000_000;
  for (let call = 0; call < AGENT_LIMITS.callsPerMinute; call += 1) assert.equal(agents.allowCall("a", now), true);
  assert.equal(agents.allowCall("a", now), false);
  assert.equal(agents.allowCall("b", now), true, "another agent is unaffected");
  assert.equal(agents.allowCall("a", now + 61_000), true, "the window slides");
});

test("the skill text points at the agent API and tells the agent to keep its key secret", () => {
  const text = agentSkillText("https://api.kova.surf");
  assert.match(text, /https:\/\/api\.kova\.surf\/api\/agent\/v1\/join\?k=KEY&n=NONCE/);
  assert.match(text, /Never share your agent key/);
  assert.doesNotMatch(text, /kova_agent_[A-Za-z0-9_-]{10,}/, "no real key is ever in the skill");
});
