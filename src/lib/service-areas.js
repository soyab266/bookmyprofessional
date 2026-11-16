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

// Exact same-city spelling aliases: the curated list keeps one canonical
// spelling per city, and each alias is that SAME city under its other common
// spelling. No metro, district, or inferred geography - an alias resolves to
// exactly its own canonical city, nothing around it.
const SAME_CITY_SPELLINGS = new Map([
  ["gurgaon", "gurugram"],
  ["bengaluru", "bangalore"],
]);

// Resolve a searched location (free text or a "City, Country" dropdown label)
// to its canonical coverage city, case-insensitively, honouring the same-city
// spelling aliases. Returns null for anything outside the curated list, so
// unlisted cities never match against service areas.
export function canonicalServiceArea(term) {
  const raw = String(term || "").trim().toLowerCase();
  if (!raw) return null;
  const base = raw.split(",")[0].trim();
  const aliased = SAME_CITY_SPELLINGS.get(base) ?? base;
  for (const city of SERVICE_AREA_CITIES) {
    if (aliased === city.toLowerCase()) return city;
  }
  return null;
}

// Every exact same-city spelling of a searched term, for matching stored
// address text: the searched spelling plus, when the term names a curated
// city (directly or via an alias), that city's other spelling. A "Gurgaon"
// search also matches addresses written "Gurugram" and vice versa; unlisted
// places keep their single literal spelling, unchanged.
export function sameCitySpellings(term) {
  const base = String(term || "").trim().split(",")[0].trim();
  const out = [];
  const push = (spelling) => {
    if (spelling && !out.some((s) => s.toLowerCase() === spelling.toLowerCase())) out.push(spelling);
  };
  push(base);
  const canonical = canonicalServiceArea(term);
  if (canonical) {
    push(canonical);
    for (const [alias, city] of SAME_CITY_SPELLINGS) {
      if (city === canonical.toLowerCase()) push(alias);
    }
  }
  return out;
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
