"use client";

import { ChevronRight } from "lucide-react";
import { XLogo } from "@/components/icons/x-logo";
import { Button } from "@/components/ui/button";

/** Primary provider. White on the dark panel so the external identity reads as its own thing. */
export function SocialLoginButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="light"
      size="lg"
      block
      onClick={onClick}
      loading={loading}
      loadingLabel="Opening X…"
      disabled={disabled}
      className="relative justify-center"
      iconLeft={<XLogo size={18} />}
    >
      Continue with X
      {!loading ? <ChevronRight size={18} className="absolute right-5 top-1/2 -translate-y-1/2 opacity-70" aria-hidden="true" /> : null}
    </Button>
  );
}
