import type { Metadata } from "next";
import { TokenScreen } from "@/features/near/token-screen";

export const metadata: Metadata = { title: "CHIP token: supply, burns and the daily call" };

export default function NearTokenPage() {
  return <TokenScreen />;
}
