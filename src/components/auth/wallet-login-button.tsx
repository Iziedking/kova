"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Secondary: wallet sign-in is available but is not the primary identity method. */
export function WalletLoginButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="lg" block onClick={onClick} disabled={disabled} iconLeft={<Wallet size={18} />}>
      Connect wallet instead
    </Button>
  );
}
