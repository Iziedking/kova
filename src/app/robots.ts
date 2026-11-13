import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isNearHost } from "@/features/near/host-routing";

/** Public pages are indexable; account pages and the old FLOAT prototype are not. The NEAR host lists its own. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (isNearHost((await headers()).get("host"))) {
    return { rules: { userAgent: "*", allow: "/", disallow: ["/api/"] }, sitemap: "https://near.kova.surf/sitemap.xml" };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/settings", "/portfolio", "/notifications", "/legacy/", "/api/"] },
    sitemap: "https://kova.surf/sitemap.xml",
  };
}
