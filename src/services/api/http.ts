import type { ZodType } from "zod";
import { fail, ok, type ServiceContext, type ServiceResult } from "@/types/service";

/**
 * Same-origin by design. `next.config.ts` rewrites `/api/game/*` to the
 * backend (`KOVA_BACKEND_API_URL`, server-only), so the browser never needs the
 * backend origin and no CORS surface is added.
 */
interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** Attach the Privy bearer token when the viewer has one. */
  auth?: boolean;
}

interface BackendErrorBody {
  ok?: false;
  code?: string;
  message?: string;
  retryable?: boolean;
}

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  ctx: ServiceContext | undefined,
  options: RequestOptions = {},
): Promise<ServiceResult<T>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";

  if (options.auth) {
    const token = (await ctx?.getAccessToken?.()) ?? null;
    if (!token) {
      return fail({ code: "AUTH_REQUIRED", message: "Sign in to continue.", retryable: false });
    }
    headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: ctx?.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return fail({ code: "NETWORK", message: "Couldn't reach Kova. Check your connection and try again.", retryable: true });
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Non-JSON body (proxy error page, 404 from an unconfigured rewrite).
  }

  if (!response.ok) {
    const body = (json ?? {}) as BackendErrorBody;
    if (response.status === 401) {
      return fail({ code: "AUTH_REQUIRED", message: body.message ?? "Sign in to continue.", retryable: false });
    }
    if (response.status === 404 && body.code === undefined) {
      return fail({ code: "UNAVAILABLE", message: "Kova's game service isn't reachable right now.", retryable: true });
    }
    if (response.status === 404) {
      return fail({ code: "NOT_FOUND", message: body.message ?? "Not found.", retryable: false });
    }
    if (response.status === 503) {
      return fail({
        code: "UNAVAILABLE",
        message: body.message ?? "This isn't available in the current environment.",
        retryable: body.retryable ?? false,
      });
    }
    return fail({
      code: "HTTP",
      message: body.message ?? `Request failed (${response.status}).`,
      retryable: body.retryable ?? response.status >= 500,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return fail({ code: "INVALID_RESPONSE", message: "Kova returned data this app can't read.", retryable: false });
  }
  return ok(parsed.data, "api");
}
