// Read only the city field from active public listings, not full profile/service data.
// Page by stable ID so the database's per-request row cap does not hide later cities.
export async function readActiveProfessionalCities(client, pageSize = 1000) {
  const cities = new Set();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("professionals")
      .select("city")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data || []) {
      const city = typeof row.city === "string" ? row.city.trim() : "";
      if (city) cities.add(city);
    }
    if (!data || data.length < pageSize) break;
  }
  return [...cities];
}

export function mergeDirectoryLocations(locations, cities) {
  const result = [...locations];
  const seen = new Set(locations.map((loc) => loc.city?.toLowerCase()));
  for (const city of cities) {
    if (seen.has(city.toLowerCase())) continue;
    seen.add(city.toLowerCase());
    result.push({ id: city, label: city, city });
  }
  return result;
}
