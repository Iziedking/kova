import { MinesScreen } from "@/features/near/grid/mines-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/mines", title: "Mines · Kova on NEAR", description: "One mine per coin. Pick one to play.", card: false });

export default function NearMinesPage() {
  return <MinesScreen />;
}
