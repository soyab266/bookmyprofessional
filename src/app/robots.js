const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dashboard", "/vendor", "/messages", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
