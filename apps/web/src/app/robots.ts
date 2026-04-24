import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // App routes are wallet-gated and dynamic; keep them out of the
        // search index. api routes live on api.verdict.xyz so they never
        // reach this bundle.
        disallow: ["/escrow", "/insurance", "/milestones", "/authenticity", "/dashboard", "/history", "/judges"],
      },
    ],
    sitemap: "https://verdict.xyz/sitemap.xml",
  };
}
