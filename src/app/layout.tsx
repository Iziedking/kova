import type { ReactNode } from "react";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
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

export const metadata = { title: "KOVA", description: "Stock-paired liquidity, reviewed before capital." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
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
