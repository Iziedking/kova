/** Season points. Off-chain, no cash value; a future season may convert them to rewards. */
export interface PointsSummary {
  season: number;
  total: number;
  breakdown: { play: number; win: number; referral: number; welcome: number };
  rules: { play: number; win: number; referral: number; welcome: number };
  /** The player's username, used as their invite code; null until they choose one. */
  referralCode: string | null;
  invited: number;
  qualified: number;
  referredBy: string | null;
}

export interface PointsRow {
  rank: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  points: number;
}
