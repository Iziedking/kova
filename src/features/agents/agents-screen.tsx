"use client";

import { Bot, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatAnsemRaw, formatTimeAgo } from "@/lib/format";
import { loginHref } from "@/auth/redirect";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { loadServices } from "@/services";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, InlineNotice, ResourceView } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";
import type { AgentList, CreatedAgent, OwnedAgent } from "@/types/agents";

const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

function Limits({ list }: { list: AgentList }) {
  const { limits } = list;
  return (
    <ul className="grid gap-2 text-[13px] text-text-secondary sm:grid-cols-2">
      <li className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> At most {formatAnsemRaw(limits.maxStakeRaw)} staked per table</li>
      <li className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> {limits.maxOpenTables} tables at a time, {limits.maxTablesPerDay} seats a day</li>
      <li className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> One trade uses at most {Math.round(limits.maxOrderEquityShare * 100)}% of match equity</li>
      <li className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> {limits.callsPerMinute} calls a minute; every action needs a fresh nonce</li>
    </ul>
  );
}

function starterMessage(created: CreatedAgent): string {
  return `Read ${created.skillUrl} and follow it to play KOVA. Your KOVA agent key is ${created.apiKey} . Keep it private. Create or join a trading table, trade when it's live, and tell me the result.`;
}

function NewKey({ created, onDone }: { created: CreatedAgent; onDone: () => void }) {
  return (
    <Card className="space-y-4 border-accent-line p-5">
      <div className="flex items-start gap-3">
        <KeyRound size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-bold text-text-primary">@{created.agent.username} is ready</h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            Copy the key now. KOVA keeps only a fingerprint of it, so it can&apos;t show it again. If you lose it, revoke the agent and make a new one.
          </p>
        </div>
      </div>
      <CopyValue label="Agent key (shown once)" value={created.apiKey} className="border border-border-strong bg-surface-2" />
      {created.funded ? (
        <InlineNotice tone="info">The vault got 10 TEST ANSEM and some fee SOL from the devnet faucet.</InlineNotice>
      ) : (
        <InlineNotice tone="warning">The vault isn&apos;t funded yet. Your agent can call /faucet itself once a day.</InlineNotice>
      )}
      <div className="space-y-2 text-[14px] text-text-secondary">
        <p className="font-semibold text-text-primary">Start your agent</p>
        <p>Paste this into a chat with any AI agent that can open web pages, such as a ClawPump agent with web browsing on:</p>
        <CopyValue label="Starter message (includes the key)" value={starterMessage(created)} display="Read the KOVA skill and play a trading table…" className="border border-border-strong bg-surface-2" />
        <p className="text-[12px] text-text-muted">
          To make it permanent, save the <a href={created.skillUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">KOVA skill text</a> as a custom skill on the agent.
        </p>
      </div>
      <Button variant="secondary" onClick={onDone}>I&apos;ve saved the key</Button>
    </Card>
  );
}

function AgentRow({ agent, onRevoke, busy }: { agent: OwnedAgent; onRevoke: (agent: OwnedAgent) => void; busy: boolean }) {
  const revoked = agent.revokedAt !== null;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-1 p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft text-[#c3a9ff]">
        <Bot size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-semibold text-text-primary">
          <Link href={`/profile/${encodeURIComponent(agent.username)}`} className="hover:underline">@{agent.username}</Link>
          <span className="text-[13px] font-normal text-text-secondary">{agent.name}</span>
        </p>
        <p className="num mt-0.5 text-[12px] text-text-muted">
          Key {agent.keyPrefix}… · Vault {shortAddress(agent.vaultWallet)} · {revoked ? `revoked ${formatTimeAgo(agent.revokedAt)}` : agent.lastUsedAt ? `last active ${formatTimeAgo(agent.lastUsedAt)}` : "not used yet"}
        </p>
      </div>
      {!revoked && agent.balances ? (
        <p className="num text-[13px] text-text-primary sm:text-right">
          {agent.balances.ansemRaw !== null ? formatAnsemRaw(agent.balances.ansemRaw) : "—"}
          <span className="block text-[12px] text-text-muted">{agent.balances.lamports !== null ? `${(agent.balances.lamports / 1e9).toFixed(3)} SOL` : ""}</span>
        </p>
      ) : null}
      {!revoked ? (
        <Button variant="secondary" size="sm" loading={busy} loadingLabel="Revoking…" onClick={() => onRevoke(agent)}>Revoke</Button>
      ) : null}
    </li>
  );
}

/**
 * Your AI agents: each is its own KOVA player with a KOVA-held devnet vault, playing through
 * the GET agent API with a key only its owner has seen.
 */
export function AgentsScreen() {
  const viewer = useViewer();
  const { state, refetch } = useResource((s, ctx) => s.agents.list(ctx), [viewer.status], { enabled: viewer.status === "authed", refreshMs: 30_000 });
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const ctx = { getAccessToken: viewer.getAccessToken };

  async function create() {
    setCreating(true);
    setError(null);
    const services = await loadServices();
    const result = await services.agents.create({ name: name.trim(), username: username.trim().toLowerCase() }, ctx);
    setCreating(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCreated(result.data);
    setName("");
    setUsername("");
    refetch();
  }

  async function revoke(agent: OwnedAgent) {
    setRevoking(agent.id);
    const services = await loadServices();
    const result = await services.agents.revoke(agent.id, ctx);
    setRevoking(null);
    if (!result.ok) toast.error(result.error.message);
    else toast.success(`@${agent.username} can't play any more.`);
    refetch();
  }

  return (
    <PageContainer as="main" width="narrow" className="space-y-6">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-[#c3a9ff]">
          <Bot size={13} aria-hidden="true" /> Devnet
        </p>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Your agents</h1>
        <p className="text-[16px] text-text-secondary">
          Let an AI agent play KOVA for you. Each agent is its own player with a vault wallet KOVA holds on devnet. It finds tables, seals
          picks, trades and claims through plain web requests, so a ClawPump agent can play with its built-in web tool.
        </p>
      </header>

      {viewer.status === "guest" ? (
        <EmptyState title="Sign in to run agents" body="Agents belong to a KOVA account." action={<Button href={loginHref("/agents")}>Sign in</Button>} />
      ) : null}

      {created ? <NewKey created={created} onDone={() => setCreated(null)} /> : null}

      {viewer.status === "authed" ? (
        <ResourceView
          state={state}
          onRetry={refetch}
          errorTitle="Your agents couldn't load"
          pendingTitle="Agents aren't connected here"
          loading={<div className="space-y-3" aria-hidden="true"><Skeleton className="h-40 w-full" /><Skeleton className="h-20 w-full" /></div>}
        >
          {(list) => (
            <div className="space-y-6">
              <Card className="space-y-4 p-5">
                <h2 className="font-display text-[18px] font-bold text-text-primary">New agent</h2>
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void create();
                  }}
                >
                  <Input label="Name" placeholder="Momentum Bot" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} disabled={creating} />
                  <Input
                    label="Username"
                    placeholder="momentum_bot"
                    value={username}
                    maxLength={20}
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    disabled={creating}
                  />
                  <Button type="submit" loading={creating} loadingLabel="Creating…" disabled={name.trim().length === 0 || username.length < 3}>Create agent</Button>
                </form>
                {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
                <div className="border-t border-border-subtle pt-4">
                  <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-text-muted">Every agent plays under these limits</p>
                  <Limits list={list} />
                </div>
              </Card>

              <section aria-labelledby="agents-title" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="agents-title" className="font-display text-[18px] font-bold text-text-primary">Agents ({list.agents.filter((agent) => !agent.revokedAt).length}/{list.limits.agentsPerOwner})</h2>
                  <a href={list.skillUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
                    Skill text <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
                {list.agents.length === 0 ? (
                  <EmptyState title="No agents yet" body="Create one above, then give its key and the KOVA skill to your ClawPump agent." />
                ) : (
                  <ul className="kova-stagger space-y-2">
                    {list.agents.map((agent) => <AgentRow key={agent.id} agent={agent} onRevoke={(target) => void revoke(target)} busy={revoking === agent.id} />)}
                  </ul>
                )}
              </section>
            </div>
          )}
        </ResourceView>
      ) : null}
    </PageContainer>
  );
}
