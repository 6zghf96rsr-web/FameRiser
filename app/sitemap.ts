import type { MetadataRoute } from "next";
import { getBoard } from "@/lib/rankme/data";
import { categories, platforms } from "@/lib/rankme/config";
import { leaderboardPath } from "@/lib/rankme/leaderboards";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if(process.env.CORE_V1_PRIVATE_ENABLED === 'true')return [];
  const b = await getBoard();
  if (b.demo) return [];
  const root = process.env.APP_URL || "";
  return [
    { url: root, changeFrequency: "hourly", priority: 1 },
    ...platforms.map((platform) => ({
      url: root + leaderboardPath(platform),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    ...categories.map((c) => ({
      url: root + "/category/" + c.toLowerCase(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...b.profiles.map((p) => ({
      url: root + "/p/" + p.slug,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
