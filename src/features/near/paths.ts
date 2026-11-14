/**
 * NEAR mode routes. On a near.* host the proxy serves every short path ("/play", "/tables", …) as a
 * rewrite of its /near twin, so links use the /near paths and work on every host.
 *
 * One page per job (docs/near/UI_BRIEF.md, "Pages"):
 *   /play         start a round
 *   /t/<id>       one table: take a seat, watch it, the result and the burn
 *   /tables       your tables, tables waiting for a player, recent results
 *   /launches     meme.cooking auctions and "Will it cook?" calls
 *   /clans        the clan race; found or join a clan
 *   /leaderboard  players and launch scouts
 *   /token        supply, burns, today's call and the daily claim
 *   /account      sign in, the game key, your CHIP
 */
export const NEAR_HOME_PATH = "/near";
export const NEAR_PLAY_PATH = "/near/play";
export const NEAR_TABLES_PATH = "/near/tables";
export const NEAR_LAUNCHES_PATH = "/near/launches";
export const NEAR_CLANS_PATH = "/near/clans";
export const NEAR_LEADERBOARD_PATH = "/near/leaderboard";
export const NEAR_TOKEN_PATH = "/near/token";
export const NEAR_ACCOUNT_PATH = "/near/account";
/** Kova v3 (the grid): mines, opening one, the CHIP token page, the leaderboard. The poker app is /near/classic. */
export const NEAR_MINES_PATH = "/near/mines";
export const NEAR_OPEN_PATH = "/near/open";
export const NEAR_CHIP_PATH = "/near/chip";
export const NEAR_LEADERS_PATH = "/near/leaders";
export const NEAR_CLASSIC_PATH = "/near/classic";

/** One coin's mine. The coin's account id has dots but no characters that need escaping. */
export function minePath(token: string): string {
  return `${NEAR_MINES_PATH}/${encodeURIComponent(token)}`;
}

export function tablePath(id: string): string {
  return `/near/t/${id}`;
}

/** The play page with a pick already chosen (a "Will it cook?" call from the launches page). */
export function playWithPick(market: string): string {
  return `${NEAR_PLAY_PATH}?pick=${encodeURIComponent(market)}`;
}
