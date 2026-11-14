import { OpenMineScreen } from "@/features/near/grid/open-mine-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/open", title: "Open a mine · Kova on NEAR", description: "One transaction creates a mine for a coin the factory accepts.", card: false });

export default function NearOpenPage() {
  return <OpenMineScreen />;
}
