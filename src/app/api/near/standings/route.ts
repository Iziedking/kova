import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBook, rankPlayers } from "@/adapters/near/standings";

/**
 * The global leaderboard: players ranked across every mine, from the books the keeper keeps
 * (scripts/near/keeper.ts writes KOVA_STANDINGS_FILE, default data/standings.json). The site and the keeper
 * must see the same file, so run them on the same machine, or point both at shared storage.
 */
export async function GET() {
  const file = resolve(process.cwd(), process.env.KOVA_STANDINGS_FILE ?? "data/standings.json");
  const book = existsSync(file) ? parseBook(readFileSync(file, "utf8")) : null;
  if (!book) return Response.json({ recording: false, ranked: [] });
  const body = { recording: true, startedAt: book.startedAt, updatedAt: book.updatedAt, ranked: rankPlayers(book) };
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), { headers: { "content-type": "application/json" } });
}
