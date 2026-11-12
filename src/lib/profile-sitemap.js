const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PUBLIC_ROUTES = ["", "/professionals", "/how-it-works", "/about", "/contact", "/privacy", "/terms"];
const PAGE_SIZE = 1000;
const MAX_PROFILES = 50000 - PUBLIC_ROUTES.length;

// Public anonymous access only, matching the directory's is_active=true rule.
// No profile contacts, session cookies or service-role credential are needed.
// Reject failed/incomplete reads instead of serving a misleading partial sitemap.
export async function readPublicProfileIds({
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fetcher = fetch,
} = {}) {
  if (!url || !anonKey) throw new Error("Public sitemap configuration unavailable");
  const ids = [];
  const signal = AbortSignal.timeout(10000);
  let expectedTotal;
  do {
    const endpoint = new URL(`${url.replace(/\/+$/, "")}/rest/v1/professionals`);
    endpoint.search = new URLSearchParams({
      select: "id", is_active: "eq.true", order: "id.asc",
      offset: String(ids.length), limit: String(PAGE_SIZE),
    }).toString();
    const response = await fetcher(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Prefer: "count=exact" },
      cache: "no-store", signal,
    });
    if (!response.ok) throw new Error("Public sitemap data unavailable");
    const range = response.headers.get("content-range");
    const count = range?.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
    if (!count) throw new Error("Public sitemap count unavailable");
    const total = Number(count[1]);
    if (total > MAX_PROFILES) throw new Error("Public sitemap needs partitioning");
    if (expectedTotal !== undefined && total !== expectedTotal) throw new Error("Public sitemap changed during pagination");
    expectedTotal = total;
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length > PAGE_SIZE || ids.length + rows.length > total) throw new Error("Invalid public sitemap data");
    if (!rows.length && ids.length < total) throw new Error("Incomplete public sitemap data");
    for (const row of rows) {
      const id = row?.id?.toLowerCase();
      if (!UUID.test(id || "") || (ids.length && id <= ids.at(-1))) throw new Error("Invalid public sitemap order or ID");
      ids.push(id);
    }
  } while (ids.length < expectedTotal);
  return ids;
}

export function buildPublicSitemap(ids, siteUrl) {
  const origin = siteUrl.replace(/\/+$/, "");
  // No synthetic lastModified: the table has no reliable modification timestamp.
  return [
    ...PUBLIC_ROUTES.map((route) => ({ url: `${origin}${route}` })),
    ...ids.map((id) => ({ url: `${origin}/professionals/${id}` })),
  ];
}
