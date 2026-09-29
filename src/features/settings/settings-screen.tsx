"use client";

import { LogOut, Shuffle } from "lucide-react";
import { useState } from "react";
import { shortAddress } from "@/lib/format";
import { useViewer } from "@/features/auth/viewer";
import { useResource } from "@/hooks/use-resource";
import { isFixtureMode } from "@/services";
import { PlayerAvatar } from "@/components/social/player-avatar";
import { PageContainer } from "@/components/shell/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, SectionHeader } from "@/components/ui/section";
import { InlineNotice, ResourceView } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { KovaIdentity } from "@/types/social";

const STATE_TONE = { live: "success", read_only: "neutral", preview_only: "warning", local_validator_only: "warning", unavailable: "danger", blocked: "danger" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-3 last:border-0">
      <span className="text-[14px] text-text-secondary">{label}</span>
      <span className="num min-w-0 truncate text-[14px] text-text-primary">{children}</span>
    </div>
  );
}

/**
 * Settings, kept deliberately small: who you are on Kova, which accounts are
 * linked, and what the platform can and cannot do today. Nothing here is a
 * questionnaire or a preference wall.
 */
export function SettingsScreen() {
  const viewer = useViewer();
  const identity = viewer.identity;
  const caps = useResource((s) => s.competitions.capabilities(), []);

  return (
    <PageContainer as="main" width="narrow" className="space-y-6">
      <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">Settings</h1>

      <Card as="section" className="p-5">
        <SectionHeader title="Profile" className="mb-4" />
        {identity ? (
          <ProfileEditor key={viewer.userId + ":" + identity.username} identity={identity} />
        ) : (
          <p className="text-[14px] text-text-secondary">You haven&apos;t chosen a Kova username yet.</p>
        )}
      </Card>

      <Card as="section" className="p-5">
        <SectionHeader title="Accounts" className="mb-2" />
        <Row label="Email">{viewer.email ?? "Not linked"}</Row>
        <Row label="X">
          {viewer.xHandle ? `@${viewer.xHandle}` : viewer.actions.linkX ? <Button size="sm" variant="secondary" onClick={() => viewer.actions.linkX?.()}>Connect X</Button> : "Not linked"}
        </Row>
        <Row label={viewer.walletKind === "embedded" ? "Kova wallet" : "Solana wallet"}>
          {viewer.walletAddress ? shortAddress(viewer.walletAddress) : <Button size="sm" variant="secondary" onClick={() => viewer.actions.connectWallet()}>Connect wallet</Button>}
        </Row>
      </Card>

      <Card as="section" className="p-5">
        <SectionHeader title="What's live" className="mb-2" />
        <p className="mb-3 text-[13px] text-text-secondary">The platform&apos;s current capabilities, straight from the game service.{isFixtureMode() ? " (Sample data in this environment.)" : ""}</p>
        <ResourceView state={caps.state} compact onRetry={caps.refetch} pendingTitle="Status isn't available" loading={<Skeleton className="h-40 w-full" />}>
          {(list) => (
            <ul>
              {list.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0">
                  <span className="text-[14px] text-text-primary">{entry.label}</span>
                  <Badge tone={STATE_TONE[entry.state]}>{entry.state.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </ResourceView>
      </Card>

      <Button variant="secondary" iconLeft={<LogOut size={16} />} onClick={() => void viewer.logout()}>Sign out</Button>
    </PageContainer>
  );
}


function ProfileEditor({ identity }: { identity: KovaIdentity }) {
  const viewer = useViewer();
  // Pristine fields follow server hydration; a dirty draft stays under the player's control.
  const [draft, setDraft] = useState<{ displayName: string; seed: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = draft ?? { displayName: identity.displayName ?? "", seed: identity.avatarSeed };
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await viewer.saveIdentity({ ...identity, displayName: fields.displayName.trim() || null, avatarSeed: fields.seed || identity.avatarSeed });
      if (!result.ok) { setError(result.error.message); return; }
      setDraft(null);
      toast.success(viewer.preview ? "Sample profile saved" : "Profile saved");
    } catch {
      setError("Your profile couldn't save. Try again.");
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <PlayerAvatar username={fields.seed || identity.username} src={identity.avatarUrl} size="xl" ring />
        {!identity.avatarUrl ? <Button variant="ghost" size="sm" disabled={busy} iconLeft={<Shuffle size={14} />} onClick={() => setDraft({ ...fields, seed: Math.random().toString(36).slice(2, 8) })}>Shuffle avatar</Button> : null}
      </div>
      <Input label="Username" value={"@" + identity.username} readOnly hint="Usernames can't be changed yet." />
      <Input label="Display name (optional)" value={fields.displayName} disabled={busy} onChange={(event) => setDraft({ ...fields, displayName: event.target.value })} maxLength={40} />
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      <Button onClick={() => void save()} loading={busy} loadingLabel="Saving…">Save changes</Button>
      <p className="text-[12px] text-text-muted">{viewer.xHandle ? "Your X name and picture show on the leaderboard and at the table." : "Link X below to show your X name and picture on the leaderboard."}</p>
    </div>
  );
}
