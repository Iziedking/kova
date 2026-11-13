import { ClansScreen } from "@/features/near/clans-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({
  path: "/clans",
  title: "Clans · Kova on NEAR",
  description: "Today's clan race on Kova. Found or join a clan; the leading clan claims a double share of the daily mint. NEAR testnet; CHIP has no value.",
});

export default function Page() {
  return <ClansScreen />;
}
