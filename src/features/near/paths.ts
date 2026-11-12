/**
 * NEAR mode routes. On a near.* host, next.config.ts also serves "/", "/play" and "/token" as
 * rewrites of these, so links use the /near paths and work on every host.
 */
export const NEAR_HOME_PATH = "/near";
export const NEAR_PLAY_PATH = "/near/play";
export const NEAR_TOKEN_PATH = "/near/token";
