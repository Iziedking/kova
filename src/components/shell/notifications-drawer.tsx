"use client";

import { Bell, Swords, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatTimeAgo } from "@/lib/format";
import { useResource } from "@/hooks/use-resource";
import { Drawer } from "@/components/ui/overlay";
import { EmptyState, ResourceView } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { KovaNotification, NotificationKind } from "@/types/notifications";

const ICONS: Record<NotificationKind, typeof Bell> = {
  challenge_received: Swords,
  challenge_accepted: Swords,
  match_starting: Bell,
  match_result: Trophy,
  payout_confirmed: Wallet,
};

function Row({ item, onNavigate }: { item: KovaNotification; onNavigate: () => void }) {
  const Icon = ICONS[item.kind];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2"
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[14px]", item.read ? "text-text-secondary" : "font-semibold text-text-primary")}>{item.title}</span>
        <span className="block text-[13px] text-text-secondary">{item.body}</span>
        <span className="mt-0.5 block text-[12px] text-text-muted">{formatTimeAgo(item.at)}</span>
      </span>
      {!item.read ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
    </Link>
  );
}

/** Challenge received/accepted, match starting, results and payouts. Each one leads somewhere. */
export function NotificationsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, refetch } = useResource((s) => s.notifications.list(), [], { enabled: open });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Notifications">
      <ResourceView
        state={state}
        onRetry={refetch}
        errorTitle="Couldn't load notifications"
        pendingTitle="Notifications aren't connected yet"
        loading={
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((key) => (
              <div key={key} className="flex gap-3 px-3 py-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        }
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState compact title="You're all caught up" body="Challenges, match starts and payouts will show up here." />}
      >
        {(items) => (
          <div className="-mx-2 space-y-0.5">
            {items.map((item) => (
              <Row key={item.id} item={item} onNavigate={() => onOpenChange(false)} />
            ))}
          </div>
        )}
      </ResourceView>
    </Drawer>
  );
}
