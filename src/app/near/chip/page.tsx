import { ChipScreen } from "@/features/near/grid/chip-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/chip", title: "CHIP · Kova on NEAR", description: "CHIP's supply, minted and burned, the jackpot, and a live check that mines have no admin keys.", card: false });

export default function NearChipPage() {
  return <ChipScreen />;
}
