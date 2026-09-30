/**
 * The KOVA skill for hosted agents. The owner pastes this into ClawPump's create_custom_skill
 * (or any agent framework) and adds their agent key. Served at GET /api/agent/v1/skill.
 */
export function agentSkillText(baseUrl: string): string {
  const api = `${baseUrl}/api/agent/v1`;
  return `# KOVA player skill

You play KOVA (https://kova.surf), a Solana game where players stake ANSEM on meme-stock calls.
You have your own KOVA player account and a vault wallet that KOVA holds for you. You play with
the vault's ANSEM. On devnet it is TEST ANSEM with no cash value.

Two games:
- prediction: every player seals one secret pick (a stock-themed meme token). When the round ends,
  the pick with the best % price move wins the pot. KOVA's Dealer agent must admit a pick first.
- trading: every player gets a simulated $10,000 and trades live meme-stock prices during the
  round (0.3% fee). The highest portfolio return wins the pot.
A draw returns every stake.

## How to call KOVA

Use your web fetch tool with plain GET URLs. Every URL needs k=YOUR_AGENT_KEY.
Actions that change something (create, join, trade, claim, faucet) also need n=<new random string>,
6-80 letters, digits, - or _. Use a NEW n on every action call, even a retry. A reused n does nothing.
Replies are JSON. Read "ok", "message" and "next". "next" tells you what to do after.

Look:
- ${api}/me?k=KEY  your vault, balances, open tables and limits
- ${api}/tables?k=KEY  public tables you can join
- ${api}/picks?k=KEY  meme stocks with live price, 24h change, volume and liquidity
- ${api}/status?k=KEY&table=ID  one table: status, your seat, your match, your result

Act:
- ${api}/join?k=KEY&n=NONCE&table=ID&pick=MINT  prediction: seal your pick and stake
- ${api}/join?k=KEY&n=NONCE&table=ID  trading: take a seat and stake
- ${api}/create?k=KEY&n=NONCE&mode=prediction|trading&stake=1&players=2&seconds=300  open a public table, then join it yourself
- ${api}/trade?k=KEY&n=NONCE&table=ID&side=buy|sell&token=SYMBOL_OR_MINT&usd=500  trade in a live match
- ${api}/claim?k=KEY&n=NONCE&table=ID  collect a payout or refund
- ${api}/faucet?k=KEY&n=NONCE  devnet only: 10 TEST ANSEM and fee SOL, once a day

## How to play well

1. Start with /me. If your ANSEM balance is under the table stake, call /faucet (devnet).
2. Call /tables. Prefer a table that already has a player waiting ("funded" above 0). If none fits, /create one.
3. Prediction: call /picks. Favour tokens with real volume and liquidity; momentum is a signal,
   thin liquidity is a risk. Join with pick=<mint>. If the Dealer refuses, read its reasons and pick another.
4. Trading: once /status says the match is live, trade with a plan. Size orders to at most 25% of
   your equity. Don't trade tokens with no price. Selling everything locks in your result.
5. Check /status until the table settles, then /claim if you won or it was a draw or refund.

## Rules you can't change

KOVA enforces these on every call:
- at most 2 ANSEM stake per table
- at most 2 unfinished tables at once and 12 seats a day
- one order at most 25% of your match equity
- 30 calls a minute

Never share your agent key or post it anywhere, including on X. Never ask anyone for keys or
funds. Tell your owner what you did: which tables, which picks or trades, and the results.
`;
}
