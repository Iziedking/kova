"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useViewer } from "@/features/auth/viewer";
import { useRequireAuth } from "@/features/auth/use-require-auth";
import { NotificationsDrawer } from "./notifications-drawer";
import { SearchPalette } from "./search-palette";
import { WalletSheet } from "@/components/auth/wallet-required-sheet";

/**
 * Global overlays (search, notifications, wallet) live at the shell so any
 * screen can open them, and so the wallet gate can resume the action that
 * needed a wallet once one is connected.
 */
interface ShellApi {
  openSearch: () => void;
  openNotifications: () => void;
  openWallet: () => void;
  /**
   * Money-required actions only (ANSEM stake, real trades). Runs `onReady`
   * immediately when a wallet is linked; otherwise asks for one, explains why,
   * and resumes `onReady` when the wallet connects.
   */
  requireWallet: (reason: string, onReady: () => void) => void;
}

const noop = () => undefined;
const ShellContext = createContext<ShellApi>({
  openSearch: noop,
  openNotifications: noop,
  openWallet: noop,
  requireWallet: noop,
});

export function useShell(): ShellApi {
  return useContext(ShellContext);
}

interface WalletRequest {
  reason: string;
  onReady: () => void;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const requireAuth = useRequireAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [request, setRequest] = useState<WalletRequest | null>(null);

  const requireWallet = useCallback(
    (reason: string, onReady: () => void) => {
      requireAuth(() => {
        if (viewer.walletAddress) {
          onReady();
          return;
        }
        setRequest({ reason, onReady });
        setWalletOpen(true);
      });
    },
    [requireAuth, viewer.walletAddress],
  );

  // Resume the interrupted action as soon as a wallet appears. `handled` makes
  // sure each request resumes once; the sheet closes by derivation (see `open`).
  const walletAddress = viewer.walletAddress;
  const handled = useRef<WalletRequest | null>(null);
  useEffect(() => {
    if (walletAddress && request && handled.current !== request) {
      handled.current = request;
      request.onReady();
    }
  }, [walletAddress, request]);

  // Global shortcuts: "/" and Cmd/Ctrl+K open search.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const api = useMemo<ShellApi>(
    () => ({
      openSearch: () => setSearchOpen(true),
      openNotifications: () => requireAuth(() => setNotificationsOpen(true)),
      openWallet: () => requireAuth(() => setWalletOpen(true)),
      requireWallet,
    }),
    [requireAuth, requireWallet],
  );

  return (
    <ShellContext.Provider value={api}>
      {children}
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <NotificationsDrawer open={notificationsOpen} onOpenChange={setNotificationsOpen} />
      <WalletSheet
        open={walletOpen && !(request !== null && walletAddress !== null)}
        onOpenChange={(open) => {
          setWalletOpen(open);
          if (!open) setRequest(null);
        }}
        reason={request?.reason ?? null}
      />
    </ShellContext.Provider>
  );
}

/** Bridges the imperative gate to a callback for components outside the shell tree. */
export function useRequireWallet() {
  return useShell().requireWallet;
}
