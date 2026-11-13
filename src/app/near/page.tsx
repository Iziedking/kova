import { NearLanding } from "@/features/near/near-landing";
import { NEAR_DESCRIPTION, NEAR_TITLE, nearPageMetadata } from "./metadata";

export const metadata = nearPageMetadata({ path: "/", title: NEAR_TITLE, description: NEAR_DESCRIPTION });

export default function NearHomePage() {
  return <NearLanding />;
}
