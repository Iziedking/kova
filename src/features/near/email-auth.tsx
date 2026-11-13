"use client";

/**
 * Email sign-in for the NEAR pages, through Privy.
 *
 * Privy runs the email code login and keeps a NEAR wallet for the login: Kova never sees its key.
 * The wallet is a NEAR implicit account (see `adapters/near/email-wallet.ts`). This provider exposes
 * only what the NEAR session needs: log in and out, find or create the NEAR wallet, sign a hash, and
 * an access token for the one backend call that funds a new account.
 *
 * Mounted only on the NEAR pages and only when NEXT_PUBLIC_PRIVY_APP_ID is set. Without it, email
 * sign-in is reported unavailable and the wallet path is unchanged.
 */
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { isImplicitAccount } from "@/adapters/near/email-wallet";
import { privyAppId } from "@/auth/privy-env";

export type EmailAuth = {
  available: boolean;
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  login: () => void;
  logout: () => Promise<void>;
  /** The login's NEAR implicit account, creating the wallet on first use. */
  nearAccount: () => Promise<string>;
  signHash: (accountId: string, hash: `0x${string}`) => Promise<string>;
  accessToken: () => Promise<string | null>;
};

const unavailable: EmailAuth = {
  available: false,
  ready: true,
  authenticated: false,
  userId: null,
  email: null,
  login: () => undefined,
  logout: async () => undefined,
  nearAccount: async () => {
    throw new Error("Email sign-in is not set up on this site.");
  },
  signHash: async () => {
    throw new Error("Email sign-in is not set up on this site.");
  },
  accessToken: async () => null,
};

const Context = createContext<EmailAuth>(unavailable);

type LinkedWallet = { type: string; chainType?: string; address?: string };

function linkedNearAccount(accounts: readonly unknown[] | undefined): string | null {
  for (const raw of accounts ?? []) {
    const a = raw as LinkedWallet;
    if (a.type === "wallet" && a.chainType === "near" && a.address && isImplicitAccount(a.address)) return a.address;
  }
  return null;
}

function Bridge({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();

  const nearAccount = useCallback(async () => {
    const existing = linkedNearAccount(privy.user?.linkedAccounts);
    if (existing) return existing;
    const { wallet } = await createWallet({ chainType: "near" });
    if (!isImplicitAccount(wallet.address)) throw new Error("The email wallet is not a NEAR implicit account.");
    return wallet.address;
  }, [privy.user, createWallet]);

  const signHash = useCallback(async (accountId: string, hash: `0x${string}`) => (await signRawHash({ address: accountId, chainType: "near", hash })).signature, [signRawHash]);

  const value = useMemo<EmailAuth>(
    () => ({
      available: true,
      ready: privy.ready,
      authenticated: privy.ready && privy.authenticated,
      userId: privy.user?.id ?? null,
      email: privy.user?.email?.address ?? null,
      login: () => privy.login({ loginMethods: ["email"] }),
      logout: () => privy.logout(),
      nearAccount,
      signHash,
      accessToken: () => privy.getAccessToken(),
    }),
    [privy, nearAccount, signHash],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function NearEmailProvider({ children }: { children: ReactNode }) {
  const appId = privyAppId();
  if (!appId) return <Context.Provider value={unavailable}>{children}</Context.Provider>;
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        appearance: {
          theme: "#0D0E13",
          accentColor: "#9B6CFF",
          landingHeader: "Play Kova with your email",
          loginMessage: "We email you a code. Privy keeps a NEAR testnet wallet for your email; Kova never sees its key.",
        },
        embeddedWallets: {
          // The NEAR wallet is created by Kova's session once the login lands (useCreateWallet), not here.
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}

export function useEmailAuth(): EmailAuth {
  return useContext(Context);
}
