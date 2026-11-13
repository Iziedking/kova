import { TokenScreen } from "@/features/near/token-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({
  path: "/token",
  title: "CHIP token: supply, burns and the daily call",
  description: "CHIP's live supply, every mint and burn, the daily call and the rules fixed at deploy, read from the contract on NEAR testnet. CHIP has no value.",
});

export default function NearTokenPage() {
  return <TokenScreen />;
}
