import type { MetadataRoute } from "next";

/** Public pages are indexable; account pages and the old FLOAT prototype are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/settings", "/portfolio", "/notifications", "/legacy/", "/api/"] },
    sitemap: "https://kova.surf/sitemap.xml",
  };
}
