import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://lawandfirm.com/bank",
      lastModified: new Date("2026-07-25"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
