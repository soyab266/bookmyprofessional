import { mapProfessional } from "./public-profile-view.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Explicit public fields only. In particular, no profiles/customer join, contact
// details, documents, review author IDs, booking IDs or payout/bank fields.
export const PUBLIC_BODY_FIELDS = "id,name,role_title,category,subcategory,specialty,bio,about,city,experience_years,hourly_rate,unit,response_time,image_url,verified,verification_status,is_active,availability,services(id,title,description,price,duration,sort,inclusions,exclusions),credentials(title,issuer,year),reviews(id,rating,comment,breakdown,created_at)";

export async function readPublicProfileBody(id, {
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fetcher = fetch,
} = {}) {
  if (!UUID.test(id) || !url || !anonKey) return null;
  const signal = AbortSignal.timeout(2500);
  const options = {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    cache: "no-store", signal,
  };
  try {
    const endpoint = new URL(`${url.replace(/\/+$/, "")}/rest/v1/professionals`);
    endpoint.search = new URLSearchParams({
      select: PUBLIC_BODY_FIELDS, id: `eq.${id}`, is_active: "eq.true",
      "reviews.status": "eq.approved", limit: "1",
    }).toString();
    const response = await fetcher(endpoint, options);
    if (!response.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (row?.id !== id || row.is_active !== true || typeof row.name !== "string") return null;
    // Preserve the directory's city/country display when public location data is
    // available. A failed optional location read does not hide a real profile.
    const locations = {};
    if (row.city) {
      try {
        const locationUrl = new URL(`${url.replace(/\/+$/, "")}/rest/v1/locations`);
        locationUrl.search = new URLSearchParams({ select: "city,country", city: `eq.${row.city}`, limit: "1" }).toString();
        const locationResponse = await fetcher(locationUrl, options);
        const locationRows = locationResponse.ok ? await locationResponse.json() : [];
        if (Array.isArray(locationRows) && locationRows[0]?.city === row.city && typeof locationRows[0].country === "string") {
          locations[row.city.toLowerCase()] = locationRows[0];
        }
      } catch { /* Retain the actual city, never invent a location. */ }
    }
    return mapProfessional(row, locations);
  } catch {
    // Bounded read failures retain the existing client recovery/not-found UI.
    return null;
  }
}
