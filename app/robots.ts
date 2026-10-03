import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(process.env.RANKME_DEMO === "true" || process.env.CORE_V1_PRIVATE_ENABLED === 'true'
        ? { disallow: "/" }
        : {
            allow: ["/", "/p/", "/category/"],
            disallow: [
              "/admin",
              "/dashboard",
              "/api/",
              "/auth/",
              "/login",
              "/join",
            ],
          }),
    },
    sitemap: process.env.APP_URL + "/sitemap.xml",
  };
}
