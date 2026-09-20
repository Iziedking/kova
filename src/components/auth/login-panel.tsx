"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { safeNext } from "@/auth/redirect";
import { useViewer } from "@/features/auth/viewer";
import { InlineNotice } from "@/components/ui/states";
import { AuthTrustNote } from "./auth-trust-note";
import { EmailLoginForm } from "./email-login-form";
import { FirstRunProfile } from "./first-run-profile";
import { OtpVerificationForm } from "./otp-verification-form";
import { SocialLoginButton } from "./social-login-button";
import { WalletLoginButton } from "./wallet-login-button";

type Step = "choose" | "code" | "first-run" | "success";

const REDIRECT_DELAY_MS = 650;

/**
 * The Kova sign-in surface (blueprint 44). Kova owns the whole UI - Continue
 * with X, Continue with email, Connect wallet instead - on top of Privy's
 * headless hooks, so OAuth, OTP and wallet signatures stay with Privy.
 *
 * Flow: choose -> (email code) -> [first-run identity, once] -> "You're in." ->
 * redirect to the safe `next` destination. Every failure stays inline and keeps
 * the other sign-in methods available.
 */
export function LoginPanel() {
  const viewer = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const reason = params.get("reason");

  const [step, setStep] = useState<Step>("choose");
  const [xLoading, setXLoading] = useState(false);
  const [xError, setXError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const authed = viewer.status === "authed";
  const needsIdentity = authed && viewer.needsIdentity;
  const doneEarly = authed && !viewer.needsIdentity;

  // Derive the visible step: an authenticated session overrides local step state.
  const visible: Step = needsIdentity ? "first-run" : doneEarly ? "success" : step;

  useEffect(() => {
    if (visible !== "success") return;
    const timer = setTimeout(() => router.replace(next), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible, next, router]);

  async function loginWithX() {
    setXError(null);
    setXLoading(true);
    const result = await viewer.actions.loginWithX();
    // On success the browser is leaving for X; keep the loading label until it does.
    if (!result.ok) {
      setXLoading(false);
      setXError(result.message);
    }
  }

  async function sendCode(address: string) {
    setEmailError(null);
    setSending(true);
    setEmail(address);
    const result = await viewer.actions.sendEmailCode(address);
    setSending(false);
    if (!result.ok) {
      setEmailError(result.message);
      return;
    }
    setCodeError(null);
    setStep("code");
  }

  async function verify(code: string) {
    setCodeError(null);
    setVerifying(true);
    const result = await viewer.actions.verifyEmailCode(code);
    setVerifying(false);
    if (!result.ok) setCodeError(result.message);
    // Success flows through viewer.status -> authed, which advances the step.
  }

  if (!viewer.authAvailable && !viewer.preview) {
    return (
      <div className="text-center">
        <h1 className="font-display text-[30px] font-bold text-text-primary">Sign in isn&apos;t available here</h1>
        <p className="mx-auto mt-3 max-w-[360px] text-[15px] leading-6 text-text-secondary">
          This environment has no sign-in provider configured, so accounts can&apos;t be created. You can still browse markets, players and tables.
        </p>
        <Link href="/markets" className="mt-6 inline-flex h-[50px] items-center gap-2 rounded-button border border-border-strong px-6 text-[15px] font-semibold text-text-primary hover:bg-surface-2">
          Browse markets <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (visible === "success") {
    return (
      <div className="flex flex-col items-center py-10 text-center" role="status">
        <CheckCircle2 size={44} className="text-success" aria-hidden="true" />
        <h2 className="mt-4 font-display text-[30px] font-bold text-text-primary">You&apos;re in.</h2>
        <p className="mt-2 text-[15px] text-text-secondary">Taking you to Kova…</p>
      </div>
    );
  }

  if (visible === "first-run") {
    return <FirstRunProfile onDone={() => setStep("success")} />;
  }

  if (visible === "code") {
    return (
      <OtpVerificationForm
        email={email}
        verifying={verifying}
        error={codeError}
        onVerify={verify}
        onResend={() => void sendCode(email)}
        onChangeEmail={() => {
          setStep("choose");
          setCodeError(null);
        }}
      />
    );
  }

  const busy = xLoading || sending;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[38px]">Welcome to Kova</h1>
        <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-6 text-text-secondary">
          Create an account or sign in to challenge players, join tables, trade, and keep your record.
        </p>
      </div>

      {reason === "expired" ? (
        <InlineNotice tone="info">Your session expired. Sign in again to continue.</InlineNotice>
      ) : reason === "required" ? (
        <InlineNotice tone="info">Sign in to continue. We&apos;ll take you straight back.</InlineNotice>
      ) : null}

      <div className="space-y-2.5">
        <SocialLoginButton onClick={() => void loginWithX()} loading={xLoading} disabled={busy && !xLoading} />
        {xError ? (
          <p role="alert" className="text-[13px] text-danger">
            {xError} You can also use email or a wallet below.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-4" role="separator" aria-label="or">
        <span className="h-px flex-1 bg-border-subtle" />
        <span className="text-[13px] text-text-muted">or</span>
        <span className="h-px flex-1 bg-border-subtle" />
      </div>

      <EmailLoginForm sending={sending} error={emailError} disabled={xLoading} onSubmit={(value) => void sendCode(value)} />

      <WalletLoginButton onClick={() => viewer.actions.loginWithWallet()} disabled={busy} />

      <AuthTrustNote />
    </div>
  );
}
