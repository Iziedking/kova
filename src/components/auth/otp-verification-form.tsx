"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

const LENGTH = 6;
const RESEND_SECONDS = 30;

/**
 * "Check your email" step: six digit boxes with auto-advance and paste, a
 * change-email escape hatch and a resend countdown (blueprint 44.10).
 */
export function OtpVerificationForm({
  email,
  verifying,
  error,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  email: string;
  verifying: boolean;
  error: string | null;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function commit(next: string[]) {
    setDigits(next);
    const code = next.join("");
    if (code.length === LENGTH && !next.includes("")) onVerify(code);
  }

  function onChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    // A browser one-time-code autofill may drop the whole code into one box.
    clean.slice(0, LENGTH - index).split("").forEach((char, offset) => {
      next[index + offset] = char;
    });
    commit(next);
    refs.current[Math.min(index + clean.length, LENGTH - 1)]?.focus();
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(LENGTH).fill("") as string[];
    pasted.split("").forEach((char, index) => {
      next[index] = char;
    });
    commit(next);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  const complete = digits.every(Boolean);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) onVerify(digits.join(""));
      }}
      className="space-y-5"
    >
      <div className="text-center">
        <h2 className="font-display text-[28px] font-bold leading-tight text-text-primary">Check your email</h2>
        <p className="mt-2 text-[15px] text-text-secondary">
          We sent a code to <span className="font-medium text-text-primary">{email}</span>
        </p>
      </div>

      <div className="flex justify-center gap-2" role="group" aria-label="One-time code">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={digit}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={LENGTH}
            aria-label={`Digit ${index + 1}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={onPaste}
            className={cn(
              "num h-[54px] w-11 rounded-input border bg-surface-1 text-center text-[22px] font-semibold text-text-primary outline-none transition-colors sm:w-12",
              "focus:border-accent focus:ring-2 focus:ring-accent/25",
              error ? "border-danger/70" : "border-border-strong",
            )}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-center text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={verifying} loadingLabel="Verifying…" disabled={!complete}>
        Verify
      </Button>

      <div className="flex items-center justify-between text-[13px]">
        <button type="button" onClick={onChangeEmail} className="text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
          Change email
        </button>
        <button
          type="button"
          disabled={seconds > 0}
          onClick={() => {
            setSeconds(RESEND_SECONDS);
            onResend();
          }}
          className="text-[#b79bff] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
        >
          {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
