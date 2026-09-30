import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/play", "/markets", "/leaderboard", "/dealer", "/legal/risk"].map((path) => ({
    url: `https://kova.surf${path}`,
    changeFrequency: path === "" ? "weekly" : "daily",
    priority: path === "" ? 1 : 0.7,
  }));
}
