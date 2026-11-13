import { NextResponse, type NextRequest } from "next/server";
import { isNearHost, nearHostRewrite } from "./features/near/host-routing";
import { isProtectedPath } from "./auth/protected-routes";
import { sessionCheckBypassed } from "./auth/preview";
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

  // The NEAR host (near.kova.surf) serves only the NEAR app, from /near. A kova.surf path such as
  // /markets is rewritten into /near too, where it is the NEAR 404, so no Solana page shows there.
  if (isNearHost(request.headers.get("host"))) {
    const rewritten = nearHostRewrite(pathname);
    if (!rewritten) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = rewritten;
    return NextResponse.rewrite(url);
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

  if (request.cookies.get("privy-token")?.value) return NextResponse.next();
  // Fixtures-only viewer (preview viewer or auth stub): there is no Privy session to check.
  if (sessionCheckBypassed()) return NextResponse.next();

  return NextResponse.redirect(new URL(loginHref(`${pathname}${search}`, "required"), request.url));
}

// Every page path, because the NEAR host is matched by host, which a matcher cannot express.
// Build output and the image optimiser are skipped; on kova.surf only protected paths do anything.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
