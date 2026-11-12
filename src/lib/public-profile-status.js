const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Match the existing client name-path fallback exactly. The current full
// client catalog is capped at 500, so name-path checks use the same window.
export function profileNameMatches(name, path) {
  return typeof name === "string" && name.toLowerCase().replace(/[^a-z0-9]/g, "-").includes(path);
}

export async function readPublicProfileStatus(id, {
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  fetcher = fetch,
} = {}) {
  if (!id || !url || !anonKey) return "unknown";
  const byId = UUID.test(id);
  try {
    const endpoint = new URL(`${url.replace(/\/+$/, "")}/rest/v1/professionals`);
    endpoint.search = new URLSearchParams({
      select: byId ? "id" : "id,name",
      is_active: "eq.true",
      ...(byId ? { id: `eq.${id}`, limit: "1" } : { order: "created_at.desc,id.asc", limit: "500" }),
    }).toString();
    const response = await fetcher(endpoint, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return "unknown";
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !UUID.test(row?.id || ""))) return "unknown";
    if (byId && (rows.length > 1 || rows.some(row => row.id.toLowerCase() !== id.toLowerCase()))) return "unknown";
    if (!byId && (rows.length > 500 || rows.some(row => typeof row.name !== "string"))) return "unknown";
    return rows.some(row => byId ? row.id.toLowerCase() === id.toLowerCase() : profileNameMatches(row.name, id))
      ? "found" : "missing";
  } catch {
    // Network/config/RLS failures are not evidence that a profile does not exist.
    return "unknown";
  }
}
