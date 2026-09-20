import { ShieldCheck } from "lucide-react";
import Link from "next/link";

/** The one sentence that explains identity vs wallet, plus the legal line. */
export function AuthTrustNote() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        <p className="text-[13px] leading-5 text-text-secondary">
          Your account is your Kova identity. Wallet permissions are requested only when an action needs them.
        </p>
      </div>
      <p className="text-center text-[12px] leading-5 text-text-muted">
        By continuing, you agree to our{" "}
        <Link href="/legal/risk" className="text-text-secondary underline underline-offset-2 hover:text-text-primary">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/legal/risk" className="text-text-secondary underline underline-offset-2 hover:text-text-primary">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
