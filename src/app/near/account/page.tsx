import { AccountScreen } from "@/features/near/account-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({
  path: "/account",
  title: "Your account · Kova on NEAR",
  description: "Sign in with a NEAR testnet wallet or your email, turn on the game key and get 1,000 CHIP. CHIP has no value.",
});

export default function Page() {
  return <AccountScreen />;
}
