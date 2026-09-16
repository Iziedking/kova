import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: "KOVA", description: "Stock-paired liquidity, reviewed." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
