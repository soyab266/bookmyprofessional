import { buildPublicSitemap, readPublicProfileIds } from "../lib/profile-sitemap";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com";

// Fetch at request time so unpublished profiles are not held in a cached sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  const ids = await readPublicProfileIds();
  return buildPublicSitemap(ids, SITE_URL);
}
