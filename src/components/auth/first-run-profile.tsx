"use client";

import { AtSign, Check, Loader2, Shuffle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { validateUsername } from "@/features/auth/identity-store";
import { useViewer } from "@/features/auth/viewer";
import { loadServices } from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/social/player-avatar";
import type { KovaIdentity } from "@/types/social";

type Availability = "idle" | "checking" | "available" | "taken" | "unknown";

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * "Make it yours." One lightweight step, only when the person has no Kova
 * identity yet: a username (required), an avatar and an optional display name.
 * X sign-in prefills what it can. No questionnaire (blueprint 44.11).
 */
export function FirstRunProfile({ onDone }: { onDone: (identity: KovaIdentity) => void }) {
  const viewer = useViewer();
  const [username, setUsername] = useState(viewer.prefill.username);
  const [displayName, setDisplayName] = useState(viewer.prefill.displayName ?? "");
  const [seed, setSeed] = useState(() => viewer.prefill.username || randomSeed());
  const [availability, setAvailability] = useState<Availability>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const formatError = touched || username ? validateUsername(username) : null;

  useEffect(() => {
    if (validateUsername(username) !== null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setAvailability("checking");
      const services = await loadServices();
      const result = await services.profile.usernameAvailability(username.trim(), { getAccessToken: viewer.getAccessToken });
      if (cancelled) return;
      if (!result.ok) setAvailability("unknown");
      else setAvailability(result.data.available === "unknown" ? "unknown" : result.data.available ? "available" : "taken");
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, viewer.getAccessToken]);

  const shownAvailability: Availability = formatError ? "idle" : availability;
  const error = formatError ?? (shownAvailability === "taken" ? "That username is taken." : null);
  const canSubmit = !validateUsername(username) && shownAvailability !== "taken" && shownAvailability !== "checking" && !submitting;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    const identity: KovaIdentity = {
      username: username.trim(),
      displayName: displayName.trim() || null,
      avatarUrl: viewer.prefill.avatarUrl,
      avatarSeed: seed,
    };
    const services = await loadServices();
    // Best effort: while profiles are not stored by the backend this returns a
    // pending result, and the identity is kept on this device only.
    await services.profile.saveIdentity(identity, { getAccessToken: viewer.getAccessToken });
    viewer.saveIdentity(identity);
    onDone(identity);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="text-center">
        <h2 className="font-display text-[30px] font-bold leading-tight text-text-primary">Make it yours.</h2>
        <p className="mt-2 text-[15px] text-text-secondary">Pick the name other players will see.</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <PlayerAvatar username={seed || "kova"} src={viewer.prefill.avatarUrl} size="xl" ring />
        {!viewer.prefill.avatarUrl ? (
          <button
            type="button"
            onClick={() => setSeed(randomSeed())}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[#b79bff] transition-colors hover:bg-surface-2"
          >
            <Shuffle size={14} aria-hidden="true" /> Shuffle avatar
          </button>
        ) : null}
      </div>

      <Input
        label="Username"
        size="lg"
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
          setAvailability("idle");
        }}
        onBlur={() => setTouched(true)}
        iconLeft={<AtSign size={17} />}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        placeholder="yourname"
        error={error}
        hint="Letters, numbers and underscores. 3–20 characters."
        suffix={
          shownAvailability === "checking" ? (
            <Loader2 size={16} className="animate-spin text-text-muted" aria-label="Checking availability" />
          ) : shownAvailability === "available" ? (
            <span className="inline-flex items-center gap-1 text-success"><Check size={15} aria-hidden="true" /> Available</span>
          ) : undefined
        }
      />
      <Input
        label="Display name (optional)"
        size="lg"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        maxLength={40}
        placeholder="How you'd like to appear"
      />

      <Button type="submit" size="lg" block loading={submitting} loadingLabel="Entering…" disabled={!canSubmit && touched}>
        Enter Kova
      </Button>
    </form>
  );
}
