import { TablesScreen } from "@/features/near/tables-screen";
import { nearPageMetadata } from "../metadata";
import { requireClassic } from "../classic-gate";

export const metadata = nearPageMetadata({
  path: "/tables",
  title: "Tables · Kova on NEAR",
  description: "Your tables, tables waiting for a player, and the latest results on Kova, read from the CHIP contract on NEAR testnet.",
});

export default function Page() {
  requireClassic();
  return <TablesScreen />;
}
