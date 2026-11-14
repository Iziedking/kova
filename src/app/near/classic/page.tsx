import { NearLanding } from "@/features/near/near-landing";
import { NEAR_DESCRIPTION, NEAR_TITLE, nearPageMetadata } from "../metadata";

/** The original poker-style landing page, kept as it was. The Kova grid landing is /near. */
export const metadata = nearPageMetadata({ path: "/classic", title: NEAR_TITLE, description: NEAR_DESCRIPTION });

export default function NearClassicPage() {
  return <NearLanding />;
}
