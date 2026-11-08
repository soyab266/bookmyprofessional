const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

const PUBLIC_ROUTES = ["", "/professionals", "/how-it-works", "/about", "/contact", "/privacy", "/terms"];

export default function sitemap() {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
  }));
}
