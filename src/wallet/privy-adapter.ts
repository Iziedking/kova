import type { PrivyDelegation, Result } from "../domain/contracts";
import type { PrivyWalletAdapter } from "../ports";

export interface PrivyRuntimeConfig {
  appId: string | null;
  nodeConfigured: boolean;
  executionEnabled: boolean;
}

export function getPrivyRuntimeConfig(env: Record<string, string | undefined> = process.env): PrivyRuntimeConfig {
  return {
    appId: env.NEXT_PUBLIC_PRIVY_APP_ID ?? null,
    nodeConfigured: Boolean(env.PRIVY_APP_ID && env.PRIVY_APP_SECRET),
    executionEnabled: env.KOVA_PRIVY_EXECUTION_ENABLED === "true",
  };
}

const unavailable = <T>(message: string): Result<T> => ({
  ok: false,
  code: "PRIVY_NOT_CONFIGURED",
  message,
  retryable: false,
});

/** Disabled until exact Privy SDK versions, policy IDs and a Raydium fixture pass phase 00. */
export function createDisabledPrivyWalletAdapter(): PrivyWalletAdapter {
  return {
    provider: "privy",
    createDelegation: async () => unavailable<PrivyDelegation>("Privy delegation is not enabled."),
    revokeDelegation: async () => unavailable<PrivyDelegation>("Privy delegation is not enabled."),
    signAndSend: async () => unavailable<{ signature: string }>("Privy transaction execution is not enabled."),
  };
}
