import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isNearHost } from "@/features/near/host-routing";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isNearHost((await headers()).get("host"))) {
    return ["", "/play", "/token"].map((path) => ({ url: `https://near.kova.surf${path}`, changeFrequency: "daily", priority: path === "" ? 1 : 0.7 }));
  }
  return ["", "/play", "/markets", "/leaderboard", "/house", "/dealer", "/legal/risk"].map((path) => ({
    url: `https://kova.surf${path}`,
    changeFrequency: path === "" ? "weekly" : "daily",
    priority: path === "" ? 1 : 0.7,
  }));
}
