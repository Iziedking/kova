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

/** Per-call context for services that need the viewer's identity. */
export interface ServiceContext {
  /** Returns a fresh Privy access token, or null for a guest. */
  getAccessToken?: () => Promise<string | null>;
  signal?: AbortSignal;
}
