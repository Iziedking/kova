import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Inter, JetBrains_Mono, Caveat } from "next/font/google";
import { ReducedMotionProvider } from "@/components/motion/reduced-motion";
import { RevealDriver } from "@/components/motion/reveal-driver";
import { Grain } from "@/components/background/grain";
import "./globals.css";

/**
 * The CSS variable names must not collide with the Tailwind theme token names,
 * or `@theme { --font-display: var(--font-display) }` becomes a circular
 * reference that silently falls back to the system stack.
 */
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
/** Handwritten accent used for the "Same Markets. A More Social Game." tagline only. */
const script = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Kova: Poker for Meme Stocks", template: "%s" },
  description: "Predict the move or trade it live. Compete with friends and the community on Solana, using ANSEM as the stake chip.",
};

export const viewport: Viewport = {
  themeColor: "#07070b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${script.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        <ReducedMotionProvider>
          <RevealDriver />
          <Grain />
          {children}
        </ReducedMotionProvider>
      </body>
    </html>
  );
}
