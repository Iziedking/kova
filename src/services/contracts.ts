/**
 * The typed seam between the Kova UI and everything behind it.
 *
 *   component -> feature hook -> KovaServices -> (api | fixtures)
 *
 * Presentation components never import a backend module or a provider payload.
 * Each interface below is the contract the backend has to satisfy; the `api`
 * implementation returns `PENDING_INTEGRATION` for anything the backend does not
 * yet provide, and the `fixtures` implementation (development only) builds the
 * same shapes so every screen state can be rendered and reviewed.
 */
import type {
  ChallengeInput,
  CreateTableInput,
  GameCapabilityState,
  PredictionViewerState,
  PublicTableSummary,
  ShowdownResult,
  TableDetail,
} from "@/types/competition";
import type { Candle, MarketAsset, MarketList, MarketQuery, MarketTrade, Timeframe } from "@/types/market";
import type { PortfolioSummary, PortfolioWindow } from "@/types/portfolio";
import type {
  HotPlayer,
  KovaIdentity,
  LeaderboardRow,
  LeaderboardScope,
  MatchHistoryItem,
  PlayerProfile,
  RecentShowdown,
} from "@/types/social";
import type { KovaNotification } from "@/types/notifications";
import type { DraftOrder, Trade, TradeQuote, TradingMatchState } from "@/types/trading";
import type { ServiceContext, ServiceResult } from "@/types/service";

export interface TableQuery {
  mode?: "prediction" | "trading";
  status?: "open" | "active";
  limit?: number;
}

export interface CompetitionService {
  capabilities(ctx?: ServiceContext): Promise<ServiceResult<GameCapabilityState[]>>;
  listTables(query?: TableQuery, ctx?: ServiceContext): Promise<ServiceResult<PublicTableSummary[]>>;
  getTable(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<TableDetail>>;
  createTable(input: CreateTableInput, ctx?: ServiceContext): Promise<ServiceResult<{ tableId: string }>>;
  joinTable(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<{ tableId: string }>>;
  setReady(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<{ tableId: string }>>;
  startMatch(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<{ tableId: string }>>;
  sendChallenge(input: ChallengeInput, ctx?: ServiceContext): Promise<ServiceResult<{ challengeId: string }>>;
  createInvitation(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<{ token: string; expiresAt: string }>>;
  /** Redeems a private-table invitation link for the signed-in viewer. */
  claimInvitation(token: string, ctx?: ServiceContext): Promise<ServiceResult<{ tableId: string }>>;
  /** The settled result of a table in either mode: standings, payout and (Prediction) revealed picks. */
  showdown(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<ShowdownResult>>;
}

export interface PredictionService {
  viewerState(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<PredictionViewerState>>;
  /** Validates a candidate mint before it is locked. Never reveals it to other players. */
  validatePick(tableId: string, mint: string, ctx?: ServiceContext): Promise<ServiceResult<{ asset: MarketAsset; eligible: boolean; reason: string | null }>>;
  lockPick(tableId: string, mint: string, ctx?: ServiceContext): Promise<ServiceResult<PredictionViewerState>>;
}

export interface MarketService {
  list(query?: MarketQuery, ctx?: ServiceContext): Promise<ServiceResult<MarketList>>;
  /** ClawPump / pump.fun meme-stock feed, normalized. */
  memeStocks(query?: MarketQuery, ctx?: ServiceContext): Promise<ServiceResult<MarketList>>;
  getByMint(mint: string, ctx?: ServiceContext): Promise<ServiceResult<MarketAsset>>;
  candles(mint: string, timeframe: Timeframe, ctx?: ServiceContext): Promise<ServiceResult<Candle[]>>;
  recentTrades(mint: string, ctx?: ServiceContext): Promise<ServiceResult<MarketTrade[]>>;
}

export interface SocialService {
  hotPlayers(ctx?: ServiceContext): Promise<ServiceResult<HotPlayer[]>>;
  recentShowdowns(ctx?: ServiceContext): Promise<ServiceResult<RecentShowdown[]>>;
  leaderboard(scope: LeaderboardScope, ctx?: ServiceContext): Promise<ServiceResult<LeaderboardRow[]>>;
  profile(username: string, ctx?: ServiceContext): Promise<ServiceResult<PlayerProfile>>;
  history(username: string, ctx?: ServiceContext): Promise<ServiceResult<MatchHistoryItem[]>>;
}

export interface TradingService {
  matchState(tableId: string, ctx?: ServiceContext): Promise<ServiceResult<TradingMatchState>>;
  /** The backend issues the quote; the client only displays it. */
  quote(order: DraftOrder, ctx?: ServiceContext): Promise<ServiceResult<TradeQuote>>;
  /** Real execution. Resolves once the wallet-approved transaction is submitted. */
  execute(quoteId: string, ctx?: ServiceContext): Promise<ServiceResult<Trade>>;
  /** Poll a submitted trade until the backend has verified it onchain. */
  status(tradeId: string, ctx?: ServiceContext): Promise<ServiceResult<Trade>>;
}

export interface PortfolioService {
  summary(window: PortfolioWindow, ctx?: ServiceContext): Promise<ServiceResult<PortfolioSummary>>;
}

export interface ProfileService {
  /** Whether a username is free. `unknown` means the backend cannot say yet. */
  usernameAvailability(username: string, ctx?: ServiceContext): Promise<ServiceResult<{ available: boolean | "unknown" }>>;
  /** Persists the viewer's identity. */
  saveIdentity(identity: KovaIdentity, ctx?: ServiceContext): Promise<ServiceResult<KovaIdentity>>;
  loadIdentity(ctx?: ServiceContext): Promise<ServiceResult<KovaIdentity | null>>;
}

export interface NotificationService {
  list(ctx?: ServiceContext): Promise<ServiceResult<KovaNotification[]>>;
}

export interface KovaServices {
  competitions: CompetitionService;
  prediction: PredictionService;
  markets: MarketService;
  social: SocialService;
  trading: TradingService;
  portfolio: PortfolioService;
  profile: ProfileService;
  notifications: NotificationService;
}
