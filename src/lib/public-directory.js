// Only fields displayed on public directory cards. No account/contact data,
// credential documents, review identities/comments, or service descriptions.
export const DIRECTORY_FIELDS = "id,name,role_title,category,subcategory,city,bio,experience_years,hourly_rate,unit,response_time,image_url,verification_status,services(id),reviews(rating)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DIRECTORY_PAGE_SIZE = 8;

export function directoryCard(row) {
  const reviews = Array.isArray(row.reviews) ? row.reviews : [];
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / reviews.length
    : 0;
  const sub = (row.subcategory || "").trim();
  const category = (row.category || "").trim();
  const role = sub && sub.toLowerCase() !== "professional" ? sub
    : category && category.toLowerCase() !== "professional" ? category
    : (row.role_title || "").trim() || "Professional";
  return {
    id: row.id, name: row.name, role, category, subcategory: sub,
    city: row.city || "", location: row.city || "", bio: row.bio || "",
    image: row.image_url || "", experienceYears: row.experience_years || 0,
    price: Number(row.hourly_rate) || 0, unit: row.unit || "hour",
    responseTime: row.response_time || "", verificationStatus: row.verification_status || "not_submitted",
    rating: Math.round(average * 10) / 10, reviewCount: reviews.length,
    services: (row.services || []).map(service => ({ id: service.id })),
  };
}

export async function readPublicDirectory(category = "all", {
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fetcher = fetch,
} = {}) {
  const unavailable = { status: "unavailable", rows: [], total: null, category };
  if (!url || !anonKey) return unavailable;
  try {
    const endpoint = new URL(`${url.replace(/\/+$/, "")}/rest/v1/professionals`);
    endpoint.search = new URLSearchParams({
      select: DIRECTORY_FIELDS, is_active: "eq.true", order: "created_at.desc,id.asc",
      offset: "0", limit: String(DIRECTORY_PAGE_SIZE),
      ...(category !== "all" ? { category: `ilike.${category}` } : {}),
    }).toString();
    const response = await fetcher(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Prefer: "count=exact" },
      cache: "no-store", signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return unavailable;
    const count = response.headers.get("content-range")?.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
    const rows = await response.json();
    if (!count || !Array.isArray(rows) || rows.length > DIRECTORY_PAGE_SIZE || rows.some(row => !UUID.test(row?.id || ""))) return unavailable;
    const total = Number(count[1]);
    if (total < rows.length || (total > 0 && rows.length === 0)) return unavailable;
    return { status: "ready", rows: rows.map(directoryCard), total, category };
  } catch {
    // A failed public read is not evidence that the directory is empty.
    return unavailable;
  }
}
