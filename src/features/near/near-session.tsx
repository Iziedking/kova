"use client";

/**
 * NEAR sign-in and the game key.
 *
 * Sign-in goes through NEAR Connect. Then one wallet approval adds a function-call key that can
 * only call CHIP's game methods and cannot move NEAR or CHIP (transfers need a deposit, which such
 * a key cannot attach). Its gas allowance is capped. The key lives only in this browser; after it
 * is added, joining, picking and claiming need no wallet popup.
 */
import { Account, KeyPair, KeyPairSigner, type KeyPairString, type Provider } from "near-api-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import { CHIP_CONTRACT_ID } from "@/adapters/near/contract";
import { CALL_GAS, ChipClient, type ChipCallResult, GAME_METHODS, NEAR_NETWORKS, type NearNetworkId, resultFromOutcome } from "@/adapters/near/chip";

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet") as NearNetworkId;
export const CHIP_CONTRACT = CHIP_CONTRACT_ID;
export const HOUSE_ACCOUNT = process.env.NEXT_PUBLIC_NEAR_HOUSE_ACCOUNT ?? "house.kingizie.testnet";
/** 0.25 NEAR of gas for the game key: hundreds of game calls, and the most it can ever spend. */
export const GAME_KEY_ALLOWANCE = "250000000000000000000000";

const network = NEAR_NETWORKS[NEAR_NETWORK];

type KeyState = "none" | "checking" | "active" | "pending";

type NearSession = {
  status: "loading" | "signed_out" | "signed_in";
  accountId: string | null;
  keyState: KeyState;
  chip: ChipClient;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Adds the game key, and claims the starter chips in the same approval when asked. */
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

export function NearSessionProvider({ children }: { children: ReactNode }) {
  const chip = useMemo(() => new ChipClient(CHIP_CONTRACT, network), []);
  const connector = useRef<NearConnector | null>(null);
  const gameKey = useRef<KeyPair | null>(null);
  const [status, setStatus] = useState<NearSession["status"]>("loading");
  const [accountId, setAccountId] = useState<string | null>(null);
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
          setStatus(id ? "signed_in" : "signed_out");
          if (id) void loadKey(id);
        });
        instance.on("wallet:signOut", () => {
          setAccountId(null);
          setStatus("signed_out");
          gameKey.current = null;
          setKeyState("none");
        });
        try {
          const { accounts } = await instance.getConnectedWallet();
          const id = accounts[0]?.accountId ?? null;
          if (cancelled) return;
          setAccountId(id);
          setStatus(id ? "signed_in" : "signed_out");
          if (id) await loadKey(id);
        } catch {
          if (!cancelled) setStatus("signed_out");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("signed_out");
          setError(`Wallet connector failed to load: ${(e as Error).message}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await connector.current?.connect();
    } catch (e) {
      setError((e as Error).message || "The wallet did not connect.");
    }
  }, []);

  const disconnect = useCallback(async () => {
    await connector.current?.disconnect();
  }, []);

  const enableGameKey = useCallback(
    async (claimStarter: boolean) => {
      if (!accountId || !connector.current) return { ok: false, message: "Connect a wallet first." };
      const key = KeyPair.fromRandom("ed25519");
      // Saved before the approval, so a closed tab does not lose a key the chain already holds.
      window.localStorage.setItem(storageKey(accountId), key.toString());
      setKeyState("pending");
      try {
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
        return { ok: false, message: (e as Error).message || "The wallet did not approve." };
      }
    },
    [accountId, loadKey],
  );

  const call = useCallback(
    async <T,>(method: string, args: Record<string, unknown>): Promise<ChipCallResult<T>> => {
      if (!accountId) throw new Error("Connect a wallet first.");
      if (gameKey.current) {
        const account = new Account(accountId, chip.provider, new KeyPairSigner(gameKey.current));
        return chip.call<T>(account, method, args);
      }
      const wallet = await connector.current!.wallet();
      const outcome = await wallet.signAndSendTransaction({
        receiverId: CHIP_CONTRACT,
        network: NEAR_NETWORK,
        actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: CALL_GAS.toString(), deposit: "0" } }],
      });
      return resultFromOutcome<T>(outcome, network);
    },
    [accountId, chip],
  );

  const value = useMemo<NearSession>(
    () => ({ status, accountId, keyState, chip, error, connect, disconnect, enableGameKey, call }),
    [status, accountId, keyState, chip, error, connect, disconnect, enableGameKey, call],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNear(): NearSession {
  const session = useContext(Context);
  if (!session) throw new Error("useNear must be used inside NearSessionProvider.");
  return session;
}

export const nearNetwork = network;
