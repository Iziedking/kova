import { MemeCookingReader, serializeLobby } from "@/adapters/near/meme-cooking";

/**
 * What is cooking on meme.cooking right now, for the "cooking now" panel. It reads meme.cooking's
 * public index and contract on NEAR mainnet (read only) and keeps the answer for 30 seconds, so one
 * busy page does not become many calls to their servers.
 */
let cached: { at: number; body: ReturnType<typeof serializeLobby> } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < 30_000) return Response.json(cached.body);
  try {
    const body = serializeLobby(await new MemeCookingReader().lobby());
    cached = { at: Date.now(), body };
    return Response.json(body);
  } catch (error) {
    // Serve the last good answer rather than an empty panel if meme.cooking is down for a moment.
    if (cached) return Response.json({ ...cached.body, stale: true });
    return Response.json({ error: { message: error instanceof Error ? error.message : "meme.cooking could not be read" } }, { status: 502 });
  }
}
