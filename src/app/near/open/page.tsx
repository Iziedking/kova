import { OpenMineScreen } from "@/features/near/grid/open-mine-screen";
import { nearPageMetadata } from "../metadata";

export const metadata = nearPageMetadata({ path: "/open", title: "Open a mine · Kova on NEAR", description: "Create a mine for an accepted coin.", card: false });

export default function NearOpenPage() {
  return <OpenMineScreen />;
}
