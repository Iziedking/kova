import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "./auth/protected-routes";
import { previewViewerEnabled } from "./auth/preview";
import { loginHref } from "./auth/redirect";

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
  // Development preview viewer (fixtures only): there is no Privy session to check.
  if (previewViewerEnabled()) return NextResponse.next();

  return NextResponse.redirect(new URL(loginHref(`${pathname}${search}`, "required"), request.url));
}

export const config = {
  matcher: ["/portfolio/:path*", "/settings/:path*", "/notifications/:path*"],
};
