"use client";

/**
 * NEAR sign-in and the game key.
 *
 * Two ways in:
 * - A wallet, through NEAR Connect. The player holds their own keys.
 * - Email, through Privy (`email-auth.tsx`). Privy keeps a NEAR wallet for the email login; it is an
 *   implicit account, which Kova funds with a little testnet NEAR the first time so it exists on chain.
 *
 * Either way, one approval then adds a function-call key that can only call CHIP's game methods and
 * cannot move NEAR or CHIP (transfers need a deposit, which such a key cannot attach). Its gas
 * allowance is capped. The key lives only in this browser; after it is added, joining, picking and
 * claiming need no approval.
 */
import { Account, actions, KeyPair, KeyPairSigner, type KeyPairString, type Provider } from "near-api-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import { CHIP_CONTRACT_ID } from "@/adapters/near/contract";
import { CALL_GAS, ChipClient, type ChipCallResult, GAME_METHODS, NEAR_NETWORKS, type NearNetworkId, resultFromOutcome } from "@/adapters/near/chip";
import { EmailWalletSigner, fundingHash, toHex } from "@/adapters/near/email-wallet";
import { NearEmailProvider, useEmailAuth } from "./email-auth";

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet") as NearNetworkId;
export const CHIP_CONTRACT = CHIP_CONTRACT_ID;
export const HOUSE_ACCOUNT = process.env.NEXT_PUBLIC_NEAR_HOUSE_ACCOUNT ?? "house.kingizie.testnet";
/** 0.25 NEAR of gas for the game key: hundreds of game calls, and the most it can ever spend. */
export const GAME_KEY_ALLOWANCE = "250000000000000000000000";

const network = NEAR_NETWORKS[NEAR_NETWORK];
const METHOD_STORE = "kova.near.signin.v1";

type KeyState = "none" | "checking" | "active" | "pending";
export type SignInMethod = "wallet" | "email";

type NearSession = {
  status: "loading" | "signed_out" | "signed_in";
  accountId: string | null;
  method: SignInMethod | null;
  /** The email behind an email sign-in, for display. */
  email: string | null;
  emailAvailable: boolean;
  /** A short line while an email account is being set up ("Creating your NEAR account…"). */
  progress: string | null;
  keyState: KeyState;
  chip: ChipClient;
  error: string | null;
  connect: () => Promise<void>;
  connectEmail: () => void;
  disconnect: () => Promise<void>;
  /** Adds the game key, and claims the starter chips right after when asked. */
  enableGameKey: (claimStarter: boolean) => Promise<{ ok: boolean; message?: string }>;
  call: <T = unknown>(method: string, args: Record<string, unknown>) => Promise<ChipCallResult<T>>;
};

const Context = createContext<NearSession | null>(null);

function storageKey(accountId: string) {
  return `kova.near.gamekey.v1.${NEAR_NETWORK}.${CHIP_CONTRACT}.${accountId}`;
}

function readStoredKey(accountId: string): KeyPair | null {
  try {
    const stored = window.localStorage.getItem(storageKey(accountId));
    return stored ? KeyPair.fromString(stored as KeyPairString) : null;
  } catch {
    return null;
  }
}

function readMethod(): SignInMethod | null {
  try {
    const value = window.localStorage.getItem(METHOD_STORE);
    return value === "email" || value === "wallet" ? value : null;
  } catch {
    return null;
  }
}

function writeMethod(value: SignInMethod | null) {
  try {
    if (value) window.localStorage.setItem(METHOD_STORE, value);
    else window.localStorage.removeItem(METHOD_STORE);
  } catch {
    // Private mode: the choice is simply not remembered.
  }
}

/** True when the key exists on chain as a function-call key for CHIP. */
async function keyIsLive(provider: Provider, accountId: string, key: KeyPair): Promise<boolean> {
  try {
    const view = (await provider.viewAccessKey({ accountId, publicKey: key.getPublicKey().toString() })) as unknown as {
      permission: { FunctionCall?: { receiver_id: string } } | string;
    };
    return typeof view.permission === "object" && view.permission.FunctionCall?.receiver_id === CHIP_CONTRACT;
  } catch {
    return false;
  }
}

async function accountExists(provider: Provider, accountId: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Session({ children }: { children: ReactNode }) {
  const email = useEmailAuth();
  const chip = useMemo(() => new ChipClient(CHIP_CONTRACT, network), []);
  const connector = useRef<NearConnector | null>(null);
  const gameKey = useRef<KeyPair | null>(null);
  const emailSigner = useRef<EmailWalletSigner | null>(null);
  const settingUp = useRef(false);
  const [status, setStatus] = useState<NearSession["status"]>("loading");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState<SignInMethod | null>(null);
  const [wantEmail, setWantEmail] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [keyState, setKeyState] = useState<KeyState>("none");
  const [error, setError] = useState<string | null>(null);

  const loadKey = useCallback(
    async (id: string) => {
      setKeyState("checking");
      const key = readStoredKey(id);
      if (key && (await keyIsLive(chip.provider, id, key))) {
        gameKey.current = key;
        setKeyState("active");
      } else {
        gameKey.current = null;
        setKeyState("none");
      }
    },
    [chip],
  );

  const signedOut = useCallback(() => {
    setAccountId(null);
    setMethod(null);
    setStatus("signed_out");
    setProgress(null);
    gameKey.current = null;
    emailSigner.current = null;
    setKeyState("none");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { NearConnector } = await import("@hot-labs/near-connect");
        const instance = new NearConnector({ network: NEAR_NETWORK, footerBranding: null });
        connector.current = instance;
        instance.on("wallet:signIn", ({ accounts }) => {
          const id = accounts[0]?.accountId ?? null;
          setAccountId(id);
          setMethod(id ? "wallet" : null);
          writeMethod(id ? "wallet" : null);
          setStatus(id ? "signed_in" : "signed_out");
          if (id) void loadKey(id);
        });
        instance.on("wallet:signOut", () => {
          if (readMethod() !== "email") signedOut();
        });
        try {
          const { accounts } = await instance.getConnectedWallet();
          const id = accounts[0]?.accountId ?? null;
          if (cancelled) return;
          if (id) {
            setAccountId(id);
            setMethod("wallet");
            setStatus("signed_in");
            await loadKey(id);
          } else if (readMethod() === "email") {
            setWantEmail(true); // the email effect below finishes the sign-in once Privy is ready
          } else {
            setStatus("signed_out");
          }
        } catch {
          if (cancelled) return;
          if (readMethod() === "email") setWantEmail(true);
          else setStatus("signed_out");
        }
      } catch (e) {
        if (!cancelled) {
          if (readMethod() === "email") setWantEmail(true);
          else setStatus("signed_out");
          setError(`Wallet connector failed to load: ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey, signedOut]);

  /** Email login done: find or create the NEAR wallet, fund it the first time, then load the game key. */
  const setUpEmail = useCallback(async () => {
    if (settingUp.current) return;
    settingUp.current = true;
    setStatus("loading");
    setError(null);
    try {
      setProgress("Finding your NEAR account…");
      const id = await email.nearAccount();
      const signer = new EmailWalletSigner(id, (hash) => email.signHash(id, hash));
      if (!(await accountExists(chip.provider, id))) {
        setProgress("Creating your NEAR testnet account…");
        if (!email.userId) throw new Error("Sign in with email again.");
        const hash = await fundingHash({ privyUserId: email.userId, accountId: id, network: network.networkId, contractId: CHIP_CONTRACT });
        const signature = await email.signHash(id, `0x${toHex(hash)}`);
        const token = await email.accessToken();
        const response = await fetch("/api/near/email-account", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ accountId: id, signature }),
        });
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        if (!response.ok) throw new Error(body?.error?.message ?? `Kova could not set up the account (${response.status}).`);
        for (let i = 0; i < 20 && !(await accountExists(chip.provider, id)); i += 1) await sleep(1_000);
        if (!(await accountExists(chip.provider, id))) throw new Error("The account is not on chain yet. Try again in a minute.");
      }
      emailSigner.current = signer;
      writeMethod("email");
      setAccountId(id);
      setMethod("email");
      setStatus("signed_in");
      setProgress(null);
      await loadKey(id);
    } catch (e) {
      setProgress(null);
      setStatus("signed_out");
      setError((e as Error).message || "Email sign-in did not finish.");
    } finally {
      settingUp.current = false;
      setWantEmail(false);
    }
  }, [email, chip, loadKey]);

  // Runs once Privy is ready and the player asked for email (or was signed in with it last visit).
  // The work happens in a timer callback, so state changes follow Privy's update instead of
  // cascading inside the effect.
  useEffect(() => {
    if (!wantEmail || !email.ready) return;
    const timer = setTimeout(() => {
      if (email.authenticated) {
        void setUpEmail();
        return;
      }
      // Remembered as an email sign-in, but Privy's session has ended.
      if (readMethod() === "email" && !settingUp.current) {
        writeMethod(null);
        setWantEmail(false);
        setStatus((s) => (s === "loading" ? "signed_out" : s));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [wantEmail, email.ready, email.authenticated, setUpEmail]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await connector.current?.connect();
    } catch (e) {
      setError((e as Error).message || "The wallet did not connect.");
    }
  }, []);

  const connectEmail = useCallback(() => {
    setError(null);
    setWantEmail(true);
    if (!email.authenticated) email.login();
  }, [email]);

  const disconnect = useCallback(async () => {
    if (method === "email") {
      writeMethod(null);
      signedOut();
      await email.logout();
      return;
    }
    writeMethod(null);
    await connector.current?.disconnect();
  }, [method, email, signedOut]);

  const enableGameKey = useCallback(
    async (claimStarter: boolean) => {
      if (!accountId) return { ok: false, message: "Sign in first." };
      const key = KeyPair.fromRandom("ed25519");
      // Saved before the approval, so a closed tab does not lose a key the chain already holds.
      window.localStorage.setItem(storageKey(accountId), key.toString());
      setKeyState("pending");
      try {
        if (method === "email" && emailSigner.current) {
          // One Privy signature adds the key; the new key then claims the starter chips itself.
          const owner = new Account(accountId, chip.provider, emailSigner.current);
          await owner.signAndSendTransaction({
            receiverId: accountId,
            actions: [actions.addFunctionCallAccessKey(key.getPublicKey(), CHIP_CONTRACT, [...GAME_METHODS], BigInt(GAME_KEY_ALLOWANCE))],
          });
          await loadKey(accountId);
          if (claimStarter) {
            const result = await chip.call(new Account(accountId, chip.provider, new KeyPairSigner(key)), "claim_starter", {});
            if (!result.success) return { ok: false, message: "The game key is on, but claiming the starter chips failed. Use Get 1,000 CHIP." };
          }
          return { ok: true };
        }
        if (!connector.current) return { ok: false, message: "Connect a wallet first." };
        const wallet = await connector.current.wallet();
        const transactions = [
          {
            receiverId: accountId,
            actions: [
              {
                type: "AddKey" as const,
                params: {
                  publicKey: key.getPublicKey().toString(),
                  accessKey: { permission: { receiverId: CHIP_CONTRACT, allowance: GAME_KEY_ALLOWANCE, methodNames: [...GAME_METHODS] } },
                },
              },
            ],
          },
          ...(claimStarter
            ? [{ receiverId: CHIP_CONTRACT, actions: [{ type: "FunctionCall" as const, params: { methodName: "claim_starter", args: {}, gas: CALL_GAS.toString(), deposit: "0" } }] }]
            : []),
        ];
        await wallet.signAndSendTransactions({ transactions, network: NEAR_NETWORK });
        await loadKey(accountId);
        return { ok: true };
      } catch (e) {
        await loadKey(accountId);
        return { ok: false, message: (e as Error).message || "The approval did not go through." };
      }
    },
    [accountId, method, chip, loadKey],
  );

  const call = useCallback(
    async <T,>(methodName: string, args: Record<string, unknown>): Promise<ChipCallResult<T>> => {
      if (!accountId) throw new Error("Sign in first.");
      if (gameKey.current) {
        const account = new Account(accountId, chip.provider, new KeyPairSigner(gameKey.current));
        return chip.call<T>(account, methodName, args);
      }
      if (method === "email" && emailSigner.current) {
        return chip.call<T>(new Account(accountId, chip.provider, emailSigner.current), methodName, args);
      }
      const wallet = await connector.current!.wallet();
      const outcome = await wallet.signAndSendTransaction({
        receiverId: CHIP_CONTRACT,
        network: NEAR_NETWORK,
        actions: [{ type: "FunctionCall", params: { methodName, args, gas: CALL_GAS.toString(), deposit: "0" } }],
      });
      return resultFromOutcome<T>(outcome, network);
    },
    [accountId, method, chip],
  );

  const value = useMemo<NearSession>(
    () => ({
      status,
      accountId,
      method,
      email: method === "email" ? email.email : null,
      emailAvailable: email.available,
      progress,
      keyState,
      chip,
      error,
      connect,
      connectEmail,
      disconnect,
      enableGameKey,
      call,
    }),
    [status, accountId, method, email.email, email.available, progress, keyState, chip, error, connect, connectEmail, disconnect, enableGameKey, call],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function NearSessionProvider({ children }: { children: ReactNode }) {
  return (
    <NearEmailProvider>
      <Session>{children}</Session>
    </NearEmailProvider>
  );
}

export function useNear(): NearSession {
  const session = useContext(Context);
  if (!session) throw new Error("useNear must be used inside NearSessionProvider.");
  return session;
}

export const nearNetwork = network;
