import { MinesScreen } from "@/features/near/grid/mines-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/mines", title: "Mines · Kova on NEAR", description: "Every coin has its own mine: a 5 by 5 grid that picks one winning square every minute.", card: false });

export default function NearMinesPage() {
  return <MinesScreen />;
}
