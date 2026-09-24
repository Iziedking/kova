export type NotificationKind =
  | "challenge_received"
  | "challenge_accepted"
  | "match_starting"
  | "match_result"
  | "payout_confirmed";

export interface KovaNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Every notification leads somewhere actionable. */
  href: string;
}
