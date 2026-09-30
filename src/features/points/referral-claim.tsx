"use client";

import { useEffect, useRef } from "react";
import { useViewer } from "@/features/auth/viewer";
import { loadServices } from "@/services";
import { toast } from "@/components/ui/toast";
import { REFERRAL_CODE, REFERRAL_KEY } from "./referral-capture";

/** Once the viewer is signed in, records the invite they arrived with. Runs at most once per page load. */
export function ReferralClaim() {
  const viewer = useViewer();
  const tried = useRef(false);

  useEffect(() => {
    if (viewer.status !== "authed" || tried.current) return;
    let code: string | null = null;
    try {
      code = window.localStorage.getItem(REFERRAL_KEY);
    } catch {
      return;
    }
    if (!code || !REFERRAL_CODE.test(code)) return;
    tried.current = true;
    void (async () => {
      const services = await loadServices();
      const result = await services.points.claimReferral(code, { getAccessToken: viewer.getAccessToken });
      // Keep the code only when the failure may be temporary.
      if (result.ok || !result.error.retryable) {
        try { window.localStorage.removeItem(REFERRAL_KEY); } catch { /* ignore */ }
      }
      if (result.ok) toast.success(`You joined with @${result.data.referrer}'s invite. Finish your first staked game to earn welcome points.`);
    })();
  }, [viewer.status, viewer.getAccessToken]);

  return null;
}
