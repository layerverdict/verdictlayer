import type { MetadataRoute } from "next";

const BASE = "https://verdict.xyz";

// Static marketing routes only — app routes are gated on a wallet and
// don't belong in search results.
const PUBLIC_ROUTES = ["/", "/architecture"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
