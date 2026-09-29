/**
 * The envelope every frontend service returns.
 *
 * `PENDING_INTEGRATION` is a first-class outcome: it means the backend
 * capability the screen needs does not exist yet. The UI renders an honest
 * "not connected" state for it and never a fabricated success.
 */
export type DataSource = "api" | "fixture";

export type ServiceErrorCode =
  | "PENDING_INTEGRATION"
  | "AUTH_REQUIRED"
  | "NOT_FOUND"
  | "NETWORK"
  | "HTTP"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE";

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  retryable: boolean;
  /** The backend capability this screen is waiting on, when code is PENDING_INTEGRATION. */
  capability?: string;
  /** The backend's own error code (e.g. TX_EXPIRED), when it sent one. */
  backendCode?: string;
}

export type ServiceResult<T> =
  | { ok: true; data: T; source: DataSource; fetchedAt: number }
  | { ok: false; error: ServiceError };

export function ok<T>(data: T, source: DataSource): ServiceResult<T> {
  return { ok: true, data, source, fetchedAt: Date.now() };
}

export function fail<T = never>(error: ServiceError): ServiceResult<T> {
  return { ok: false, error };
}

export function pending<T = never>(capability: string, message?: string): ServiceResult<T> {
  return {
    ok: false,
    error: {
      code: "PENDING_INTEGRATION",
      capability,
      retryable: false,
      message: message ?? "This isn't connected to live data yet.",
    },
  };
}

/**
 * The viewer's Solana wallet, as far as game actions need it. Every call opens the
 * wallet's own approval prompt; nothing signs silently.
 */
export interface GameWallet {
  address: string;
  /** Signs a UTF-8 message; returns the base64 signature. Used only for wallet-ownership proof. */
  signMessage: (message: string) => Promise<string>;
  /** Signs and submits a base64 transaction the backend prepared; returns the base58 signature. */
  signAndSend: (transactionBase64: string) => Promise<string>;
  /** Sign only, returning the signed transaction; KOVA then sends it. Preferred over signAndSend. */
  signTransaction?: (transactionBase64: string) => Promise<string>;
}

/** Per-call context for services that need the viewer's identity. */
export interface ServiceContext {
  /** Returns a fresh Privy access token, or null for a guest. */
  getAccessToken?: () => Promise<string | null>;
  /** Present only when a Solana wallet is linked and can sign. */
  wallet?: GameWallet | null;
  signal?: AbortSignal;
}
