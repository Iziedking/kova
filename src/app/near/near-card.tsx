import type { ReactNode } from "react";

/** The frame every NEAR share image uses: 1200 x 630, CHIP's colours, the testnet note. */
export function NearCard({ kicker, title, lines, footer }: { kicker: string; title: string; lines: ReactNode[]; footer: string }) {
  return (
    <div
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 80px",
        background: "radial-gradient(circle at 18% 20%, #2a1760 0%, #0d0b1c 50%, #07070b 100%)", color: "#f4f2ff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, letterSpacing: 6, color: "#b9a3ff" }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: "#ff6b4a", boxShadow: "0 0 30px rgba(255,107,74,0.8)" }} />
        {kicker}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2 }}>{title}</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", fontSize: 36, lineHeight: 1.3, color: i === 0 ? "#e7e2ff" : "#c9c4de" }}>
            {line}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#9b8fc4" }}>
        <span>{footer}</span>
        <span>NEAR testnet · CHIP has no value</span>
      </div>
    </div>
  );
}
