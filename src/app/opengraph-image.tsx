import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The card X, Telegram and Discord show when someone shares kova.surf. */
export const alt = "Kova: Poker for Meme Stocks. Predict the move or trade it live, with ANSEM as the stake.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const icon = await readFile(join(process.cwd(), "public/brand/kova-app-icon.jpg"));
  const iconSrc = `data:image/jpeg;base64,${icon.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 88px", gap: 64,
          background: "radial-gradient(circle at 22% 50%, #2a1760 0%, #0d0b1c 45%, #07070b 100%)", color: "#f4f2ff",
        }}
      >
        <img src={iconSrc} width={300} height={300} alt="" style={{ borderRadius: 66, boxShadow: "0 0 90px rgba(155,108,255,0.55)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 680 }}>
          <div style={{ fontSize: 30, letterSpacing: 8, color: "#b9a3ff" }}>KOVA · ON SOLANA</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>Poker for Meme Stocks.</div>
          <div style={{ fontSize: 34, lineHeight: 1.3, color: "#c9c4de" }}>Predict the move or trade it live. Stake ANSEM, beat another player, take the pot.</div>
          <div style={{ fontSize: 30, color: "#9b6cff" }}>kova.surf</div>
        </div>
      </div>
    ),
    size,
  );
}
