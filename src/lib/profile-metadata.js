const PUBLIC_FIELDS = "id,name,role_title,category,subcategory,city";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value, max = 80) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Anonymous read only. Never use an account cookie or service-role credential
// for public search/share metadata. Select no contacts, documents or bank data.
export async function readPublicProfileMetadata(id, {
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fetcher = fetch,
} = {}) {
  if (!UUID.test(id) || !url || !anonKey) return null;
  try {
    const endpoint = new URL(`${url.replace(/\/+$/, "")}/rest/v1/professionals`);
    endpoint.search = new URLSearchParams({
      select: PUBLIC_FIELDS,
      id: `eq.${id}`,
      is_active: "eq.true",
      limit: "1",
    }).toString();
    const response = await fetcher(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.id?.toLowerCase() === id.toLowerCase() ? row : null;
  } catch {
    // Missing config, RLS/network errors and timeouts keep the page available.
    return null;
  }
}

export function buildProfileMetadata(id, profile, siteUrl) {
  const origin = siteUrl.replace(/\/+$/, "");
  const canonical = `${origin}/professionals/${encodeURIComponent(id)}`;
  const name = text(profile?.name);
  const role = text(profile?.subcategory) || text(profile?.role_title) || text(profile?.category);
  const city = text(profile?.city);
  const title = name
    ? [name, role, city].filter(Boolean).join(" | ")
    : "Professional Profile";
  const description = name
    ? `View ${name}'s${role ? ` ${role}` : " professional"} profile${city ? ` in ${city}` : ""}. Explore their listed services and availability on Book My Professional.`
    : "View professional profiles, listed services and availability on Book My Professional.";
  const shareTitle = `${title} | Book My Professional`;

  return {
    title: { absolute: shareTitle },
    description,
    keywords: [],
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "en_IN",
      url: canonical,
      siteName: "Book My Professional",
      title: shareTitle,
      description,
      images: [{ url: `${origin}/og-image.png`, width: 1200, height: 630, alt: "Book My Professional" }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [`${origin}/og-image.png`],
    },
  };
}
