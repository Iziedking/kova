"use client";

import { ArrowRight, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Email entry: validates the shape locally, and shows a send failure directly beneath the field. */
export function EmailLoginForm({
  sending,
  error,
  disabled,
  onSubmit,
}: {
  sending: boolean;
  error: string | null;
  disabled?: boolean;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    setLocalError(null);
    onSubmit(value);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3.5">
      <Input
        label="Email address"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        size="lg"
        placeholder="you@domain.com"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (localError) setLocalError(null);
        }}
        iconLeft={<Mail size={17} />}
        error={localError ?? error}
        disabled={disabled}
      />
      <Button type="submit" size="lg" block loading={sending} loadingLabel="Sending code…" disabled={disabled} iconRight={<ArrowRight size={18} />}>
        Continue with email
      </Button>
    </form>
  );
}
