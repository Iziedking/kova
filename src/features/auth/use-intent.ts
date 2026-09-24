"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Reads `?intent=` so a page can reopen the sheet the person was about to use
 * before they were sent to sign in. `clear` removes it from the URL.
 *
 * Uses `useSearchParams`, so the calling client component must sit inside a
 * `<Suspense>` boundary in its page.
 */
export function useIntent(): { intent: string | null; clear: () => void } {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [cleared, setCleared] = useState(false);
  const raw = params.get("intent");

  const clear = useCallback(() => {
    setCleared(true);
    const next = new URLSearchParams(params.toString());
    next.delete("intent");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return { intent: cleared ? null : raw, clear };
}
