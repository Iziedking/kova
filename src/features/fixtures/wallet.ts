import type { GameWallet } from "@/types/service";

/** Fixture services simulate actions; this wallet must never sign or send real bytes. */
export function fixtureGameWallet(address: string): GameWallet {
  const refuse = async (): Promise<never> => {
    throw new Error("A fixture wallet cannot sign messages or send transactions.");
  };
  return { address, signMessage: refuse, signAndSend: refuse };
}
