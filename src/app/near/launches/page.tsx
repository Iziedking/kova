import { LaunchesScreen } from "@/features/near/launches-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({
  path: "/launches",
  title: "Launches · Kova on NEAR",
  description: "What is cooking on meme.cooking, and the Will it cook? calls open now. NEAR testnet; CHIP has no value.",
});

export default function Page() {
  return <LaunchesScreen />;
}
