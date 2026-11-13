// "Areas served" — the cities a professional declares they accept bookings
// from, independent of the address/city on their profile. This is the
// willingness-to-serve list: it never rewrites a pro's stored address, and a
// city search matches a pro only when the pro explicitly declared that city.
//
// The choices are the site's curated coverage cities (the locations table
// seeds, mirrored in DEFAULT_LOCATIONS), so every value is a city the
// directory already offers as a search option. No geography is invented here.

import { DEFAULT_LOCATIONS } from "./data/locations.js";

export const SERVICE_AREA_CITIES = DEFAULT_LOCATIONS.map((loc) => loc.city);

// Resolve a searched location (free text or a "City, Country" dropdown label)
// to its canonical coverage city, case-insensitively. Returns null for
// anything outside the curated list, so unlisted cities never match against
// service areas.
export function canonicalServiceArea(term) {
  const value = String(term || "").trim().toLowerCase();
  if (!value) return null;
  for (const city of SERVICE_AREA_CITIES) {
    const lower = city.toLowerCase();
    if (value === lower || value.startsWith(`${lower},`)) return city;
  }
  return null;
}

// Keep only known coverage cities, trimmed, de-duplicated, in canonical case.
export function sanitizeServiceAreas(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const item of input) {
    const canonical = canonicalServiceArea(item);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

// Does this mapped professional declare the canonical city as served?
export function servesArea(pro, city) {
  const target = String(city || "").trim().toLowerCase();
  if (!target) return false;
  const areas = Array.isArray(pro?.serviceAreas) ? pro.serviceAreas : [];
  return areas.some((area) => String(area).trim().toLowerCase() === target);
}
