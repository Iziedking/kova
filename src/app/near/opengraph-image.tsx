import { ImageResponse } from "next/og";
import { NEAR_CARD_ALT } from "./metadata";

/** The card X, Telegram and Discord show for near.kova.surf links: the pitch on the left, a 5 by 5 mine on the right. */
export const alt = NEAR_CARD_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WINNER = 12; // the middle square

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "56px 72px",
          background: "radial-gradient(circle at 15% 20%, #2a1760 0%, #0d0b1c 52%, #07070b 100%)", color: "#f4f2ff",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, letterSpacing: 6, color: "#b9a3ff" }}>
            <div style={{ width: 20, height: 20, borderRadius: 10, background: "#9b6cff" }} />
            KOVA · ON NEAR
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2 }}>Put your memecoin on a square. Every minute, one square wins.</div>
            <div style={{ display: "flex", fontSize: 30, lineHeight: 1.3, color: "#c9c4de" }}>Every coin gets its own mine. Losing coins go to the winners, and 10% is burned for good.</div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#9b8fc4" }}>NEAR testnet · coins have no value</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Array.from({ length: 5 }, (_, row) => (
            <div key={row} style={{ display: "flex", gap: 12 }}>
              {Array.from({ length: 5 }, (_, col) => {
                const index = row * 5 + col;
                const win = index === WINNER;
                return (
                  <div
                    key={col}
                    style={{
                      width: 76, height: 76, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                      background: win ? "linear-gradient(180deg, #b092ff, #8f63f4)" : "#16142a",
                      border: win ? "2px solid #d9c9ff" : "1px solid #2b2848",
                      color: win ? "#0d0616" : "#6e6a92",
                    }}
                  >
                    {index + 1}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
