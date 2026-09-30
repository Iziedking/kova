"use client";

import { useEffect } from "react";

export const REFERRAL_KEY = "kova:ref";
export const REFERRAL_CODE = /^[a-z0-9_]{3,20}$/;

/**
 * Remembers an invite code from ?ref= on any page, so it survives the sign-in round trip.
 * The code is claimed after sign-in by ReferralClaim. Browser storage can be unavailable; then
 * the invite is simply not recorded.
 */
export function ReferralCapture() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref")?.trim().toLowerCase().replace(/^@/, "");
    if (!code || !REFERRAL_CODE.test(code)) return;
    try {
      if (!window.localStorage.getItem(REFERRAL_KEY)) window.localStorage.setItem(REFERRAL_KEY, code);
    } catch {
      /* storage blocked: no referral */
    }
  }, []);
  return null;
}
