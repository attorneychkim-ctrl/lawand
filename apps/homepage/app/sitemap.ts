import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://lawandfirm.com/bank",
      lastModified: new Date("2026-08-04"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://lawandfirm.com/bank/cases",
      lastModified: new Date("2026-08-04"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/reviews",
      lastModified: new Date("2026-07-29"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/self-diagnosis",
      lastModified: new Date("2026-08-03"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://lawandfirm.com/about",
      lastModified: new Date("2026-07-29"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/people",
      lastModified: new Date("2026-07-31"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/privacy",
      lastModified: new Date("2026-07-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://lawandfirm.com/terms",
      lastModified: new Date("2026-07-31"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://lawandfirm.com/bank/personal-rehabilitation",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: "https://lawandfirm.com/bank/personal-rehabilitation/eligibility",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/personal-rehabilitation/process",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/personal-rehabilitation/documents",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/personal-rehabilitation/repayment",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/guides/costs",
      lastModified: new Date("2026-07-31"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/personal-bankruptcy",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: "https://lawandfirm.com/bank/personal-bankruptcy/eligibility",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/personal-bankruptcy/process",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/personal-bankruptcy/documents",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/compare",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/situations",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: "https://lawandfirm.com/bank/situations/collection-and-seizure",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/situations/investment-debt",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://lawandfirm.com/bank/situations/self-employed",
      lastModified: new Date("2026-07-26"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
  ];
}
