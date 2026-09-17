import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "./auth/protected-routes";

/**
 * Optimistic redirect only.
 *
 * This checks that Privy's access-token cookie is present; it does not verify
 * it, because the Next 16 proxy documentation is explicit that proxy is not a
 * session-management or authorization solution. Every protected page
 * independently calls `getSession()`, which verifies the token server-side, so a
 * forged cookie gets past this and is then rejected by the page.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; this file must sit beside `app`.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  if (request.cookies.get("privy-token")?.value) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/app/:path*"],
};
