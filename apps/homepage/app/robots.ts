import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/request/", "/api/"],
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
    ],
    sitemap: "https://lawandfirm.com/sitemap.xml",
    host: "https://lawandfirm.com",
  };
}
