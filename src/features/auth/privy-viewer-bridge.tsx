"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignAndSendTransaction, useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { getBase58Decoder } from "@solana/kit";
import { fail, type GameWallet, type ServiceResult } from "@/types/service";
import { KOVA_SOLANA_CHAIN } from "@/wallet/chain";
import { ViewerProvider, type AuthResult, type EmailFlowStatus, type Viewer } from "./viewer";
import { readIdentity, suggestUsername, useStoredIdentity, writeIdentity } from "./identity-store";
import type { KovaIdentity } from "@/types/social";
import { loadServices } from "@/services";

/**
 * Adapts Privy's headless hooks to the app's `Viewer` contract, so the Kova UI
 * owns the whole sign-in experience while Privy keeps doing the secure parts
 * (OAuth, OTP, wallet signatures, session tokens).
 *
 * Must render inside `PrivyProvider`. It requests no signature and creates no
 * wallet; see the custody note in `privy-client-provider.tsx`.
 */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    // Privy messages are user-safe but terse; only surface them for the OTP cases.
    if (/code/i.test(error.message)) return error.message;
  }
  return fallback;
}

const SESSION_GRACE_MS = 4000;
const DEVNET = KOVA_SOLANA_CHAIN === "solana:devnet";

const EMAIL_STATUS: Record<string, EmailFlowStatus> = {
  initial: "idle",
  "sending-code": "sending",
  "awaiting-code-input": "awaiting-code",
  "submitting-code": "verifying",
  done: "done",
  error: "error",
};

export function PrivyViewerBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout, getAccessToken, login, linkWallet, connectWallet, linkTwitter } = usePrivy();
  const oauth = useLoginWithOAuth();
  const emailLogin = useLoginWithEmail();

  // If Privy cannot initialise (offline, blocked, outage) the session would stay "loading" forever.
  // After a grace period the viewer becomes a guest so public browsing and the sign-in gates keep working.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setGaveUp(true), SESSION_GRACE_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const userId = authenticated ? (user?.id ?? null) : null;
  const stored = useStoredIdentity(userId);
  const sessionId = useRef(userId);
  const identityRevision = useRef(0);
  useEffect(() => { sessionId.current = userId; }, [userId]);

  const email = user?.email?.address ?? null;
  const xAccount = user?.twitter ?? null;
  const solanaAccounts = (user?.linkedAccounts ?? []).filter(
    (account) => account.type === "wallet" && "chainType" in account && account.chainType === "solana",
  );
  const isEmbedded = (account: (typeof solanaAccounts)[number]) => "walletClientType" in account && account.walletClientType === "privy";
  const embeddedAccount = solanaAccounts.find(isEmbedded);
  const embeddedAddress = embeddedAccount && "address" in embeddedAccount ? embeddedAccount.address : null;
  const externalAccount = solanaAccounts.find((account) => !isEmbedded(account));
  const linkedExternal = externalAccount && "address" in externalAccount ? externalAccount.address : null;

  // Game signing always goes through a wallet approval prompt. Two kinds of wallet can sign:
  // - an external wallet (Phantom and others). On mainnet it must be linked to the account. On
  //   devnet a connected wallet is enough: Privy's link step signs a message fixed to "Chain ID:
  //   mainnet", which wallets in testnet mode refuse to show.
  // - the built-in Privy wallet, created at sign-in for players without one. Its key stays with the
  //   player through Privy; KOVA never holds it.
  // An external wallet wins when one is connected. The backend trusts neither path: it binds a
  // wallet only after its own signed proof.
  const { wallets: solanaWallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { createWallet } = useCreateWallet();
  // Privy makes the built-in wallet only at sign-in, so accounts that signed in before it was switched
  // on have none. Create it once for any signed-in account without a wallet of its own.
  const createAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !authenticated || !user || embeddedAddress || linkedExternal) return;
    if (createAttempted.current === user.id) return;
    createAttempted.current = user.id;
    void createWallet().catch(() => {
      // Dashboard not enabled or Privy busy: the wallet sheet still offers "Create my Kova wallet".
    });
  }, [ready, authenticated, user, embeddedAddress, linkedExternal, createWallet]);
  const externalWallet = solanaWallets.find((wallet) => wallet.address !== embeddedAddress && (linkedExternal ? wallet.address === linkedExternal : DEVNET && authenticated)) ?? null;
  const embeddedWallet = embeddedAddress ? solanaWallets.find((wallet) => wallet.address === embeddedAddress) ?? null : null;
  const signingWallet = externalWallet ?? embeddedWallet;
  const walletAddress = signingWallet?.address ?? linkedExternal ?? embeddedAddress;
  const walletKind: Viewer["walletKind"] = signingWallet ? (signingWallet === embeddedWallet ? "embedded" : "external") : null;
  const gameWallet = useMemo<GameWallet | null>(() => {
    if (!signingWallet) return null;
    return {
      address: signingWallet.address,
      signMessage: async (message) => {
        const { signature } = await signMessage({ message: new TextEncoder().encode(message), wallet: signingWallet });
        let binary = "";
        for (const byte of signature) binary += String.fromCharCode(byte);
        return btoa(binary);
      },
      signAndSend: async (transactionBase64) => {
        const transaction = Uint8Array.from(atob(transactionBase64), (char) => char.charCodeAt(0));
        const { signature } = await signAndSendTransaction({ transaction, wallet: signingWallet, chain: KOVA_SOLANA_CHAIN });
        return getBase58Decoder().decode(signature);
      },
    };
  }, [signingWallet, signMessage, signAndSendTransaction]);

  const loginWithX = useCallback(async (): Promise<AuthResult> => {
    try {
      await oauth.initOAuth({ provider: "twitter" });
      return { ok: true };
    } catch {
      return { ok: false, message: "We couldn't sign you in with X. Try again." };
    }
  }, [oauth]);

  const sendEmailCode = useCallback(
    async (address: string): Promise<AuthResult> => {
      try {
        await emailLogin.sendCode({ email: address });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageOf(error, "We couldn't send a code to that email. Check it and try again.") };
      }
    },
    [emailLogin],
  );

  const verifyEmailCode = useCallback(
    async (code: string): Promise<AuthResult> => {
      try {
        await emailLogin.loginWithCode({ code });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: messageOf(error, "That code didn't work. Check it or request a new one.") };
      }
    },
    [emailLogin],
  );

  // The profile lives on the server; this browser keeps a copy so pages render at once.
  // Loaded at sign-in, and again (with a fresh X read) once an X link finishes.
  const xUsername = xAccount?.username ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const revision = identityRevision.current;
    void loadServices().then(async (services) => {
      const scopedToken = async () => {
        if (cancelled || sessionId.current !== userId) return null;
        const token = await getAccessToken();
        return !cancelled && sessionId.current === userId ? token : null;
      };
      const result = await services.profile.loadIdentity({ getAccessToken: scopedToken });
      if (cancelled || identityRevision.current !== revision || !result.ok) return;
      if (result.data) {
        writeIdentity(userId, result.data);
        return;
      }
      // A username chosen before profiles were saved on the server lives only in this browser.
      // Copy it up so the player's public profile and leaderboard entry exist.
      const local = readIdentity(userId);
      if (local) {
        const saved = await services.profile.saveIdentity(local, { getAccessToken: scopedToken });
        if (!cancelled && identityRevision.current === revision && saved.ok) writeIdentity(userId, saved.data);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, xUsername, getAccessToken]);

  const saveIdentity = useCallback(
    async (identity: KovaIdentity): Promise<ServiceResult<KovaIdentity>> => {
      if (!userId) return fail({ code: "AUTH_REQUIRED", message: "Sign in to save your profile.", retryable: false });
      const revision = ++identityRevision.current;
      try {
        const services = await loadServices();
        const scopedToken = async () => {
          if (sessionId.current !== userId || identityRevision.current !== revision) return null;
          const token = await getAccessToken();
          return sessionId.current === userId && identityRevision.current === revision ? token : null;
        };
        const saved = await services.profile.saveIdentity(identity, { getAccessToken: scopedToken });
        if (sessionId.current !== userId || identityRevision.current !== revision) return fail({ code: "AUTH_REQUIRED", message: "Your account changed. Try saving again.", retryable: true });
        if (saved.ok) writeIdentity(userId, saved.data);
        return saved;
      } catch {
        return fail({ code: "NETWORK", message: "Your profile couldn't save. Try again.", retryable: true });
      }
    },
    [userId, getAccessToken],
  );

  const viewer = useMemo<Viewer>(() => {
    const status: Viewer["status"] = !ready ? (gaveUp ? "guest" : "loading") : authenticated ? "authed" : "guest";
    const identity = stored ?? null;
    return {
      status,
      authAvailable: true,
      preview: false,
      walletLogin: !DEVNET,
      userId,
      email,
      xHandle: xAccount?.username ?? null,
      walletAddress,
      walletKind,
      gameWallet,
      identity,
      needsIdentity: status === "authed" && stored === null,
      prefill: {
        username: suggestUsername(xAccount?.username ?? email),
        displayName: xAccount?.name ?? null,
        avatarUrl: xAccount?.profilePictureUrl ?? null,
      },
      emailStatus: EMAIL_STATUS[emailLogin.state.status] ?? "idle",
      actions: {
        loginWithX,
        sendEmailCode,
        verifyEmailCode,
        loginWithWallet: () => login({ loginMethods: ["wallet"] }),
        connectWallet: () => (DEVNET ? connectWallet({ walletChainType: "solana-only" }) : linkWallet()),
        linkX: () => linkTwitter(),
        createWallet: async () => {
          if (embeddedAddress) return { ok: true };
          try {
            await createWallet();
            return { ok: true };
          } catch {
            return { ok: false, message: "We couldn't create your wallet. Try again, or connect Phantom instead." };
          }
        },
      },
      getAccessToken: async () => (authenticated ? getAccessToken() : null),
      logout: async () => {
        await logout();
      },
      saveIdentity,
    };
  }, [
    ready,
    gaveUp,
    authenticated,
    stored,
    userId,
    email,
    xAccount,
    walletAddress,
    walletKind,
    embeddedAddress,
    createWallet,
    gameWallet,
    emailLogin.state.status,
    loginWithX,
    sendEmailCode,
    verifyEmailCode,
    login,
    linkWallet,
    connectWallet,
    linkTwitter,
    getAccessToken,
    logout,
    saveIdentity,
  ]);

  return <ViewerProvider value={viewer}>{children}</ViewerProvider>;
}
