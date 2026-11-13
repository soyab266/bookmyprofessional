// Place-name groupings for location matching.
//
// METRO_ALIASES is the developer's original pincode-verification table
// (src/app/api/location/verify-pincode/route.js), kept here verbatim so
// pincode city validation keeps its existing behavior.
//
// Directory location search deliberately uses NARROWER groupings:
// - SEARCH_NAME_ALIASES: official renames / alternate spellings of the same
//   city (Bengaluru = Bangalore). Symmetric.
// - SEARCH_METRO_AREAS: directional - searching the metro also matches these
//   stored area/district names (Hyderabad finds K.V.Rangareddy, which the
//   site owner confirmed belongs to the Hyderabad area). The reverse is NOT
//   widened: selecting a specific area or district stays a literal match.
// Separate cities near a metro (Thane, Navi Mumbai, Howrah, Pimpri-Chinchwad,
// Greater Noida, Medchal) are intentionally excluded from search expansion.

export const METRO_ALIASES = {
  hyderabad:   ["hyderabad", "secunderabad", "cyberabad", "rangareddy", "kvrangareddy", "shamshabad", "medchal", "ranga reddy"],
  rangareddy:  ["hyderabad", "secunderabad", "rangareddy", "kvrangareddy", "shamshabad"],
  bangalore:   ["bangalore", "bengaluru", "bengaluru urban", "bengaluru rural"],
  bengaluru:   ["bangalore", "bengaluru", "bengaluru urban", "bengaluru rural"],
  mumbai:      ["mumbai", "bombay", "navi mumbai", "thane", "mumbai suburban", "mumbai city"],
  delhi:       ["delhi", "new delhi", "central delhi", "south delhi", "north delhi", "east delhi", "west delhi"],
  "new delhi": ["delhi", "new delhi", "central delhi"],
  kolkata:     ["kolkata", "calcutta", "howrah"],
  chennai:     ["chennai", "madras"],
  gurgaon:     ["gurgaon", "gurugram"],
  gurugram:    ["gurgaon", "gurugram"],
  noida:       ["noida", "greater noida", "gautam buddha nagar"],
  pune:        ["pune", "pimpri-chinchwad"],
};

export const SEARCH_NAME_ALIASES = {
  bangalore: ["bangalore", "bengaluru"],
  mumbai:    ["mumbai", "bombay"],
  delhi:     ["delhi", "new delhi"],
  kolkata:   ["kolkata", "calcutta"],
  chennai:   ["chennai", "madras"],
  gurgaon:   ["gurgaon", "gurugram"],
};

export const SEARCH_METRO_AREAS = {
  hyderabad: ["secunderabad", "cyberabad", "rangareddy", "kvrangareddy", "ranga reddy", "shamshabad"],
  mumbai:    ["mumbai city", "mumbai suburban"],
  delhi:     ["central delhi", "south delhi", "north delhi", "east delhi", "west delhi"],
  bangalore: ["bengaluru urban"],
  noida:     ["gautam buddha nagar"],
};

export function normalizeLocationName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// Every stored-city term a location search should match:
// - a searched metro expands to its alternate names plus its area/district
//   names (Hyderabad -> ...rangareddy...);
// - an area/district name searched directly (K.V.Rangareddy) and any city
//   outside the tables pass through unchanged for exact literal matching.
export function locationSearchTerms(value) {
  const term = String(value || "").trim();
  const norm = normalizeLocationName(term);
  if (!norm) return [];
  for (const [key, names] of Object.entries(SEARCH_NAME_ALIASES)) {
    if (names.some((name) => normalizeLocationName(name) === norm)) {
      return [...new Set([...names, ...(SEARCH_METRO_AREAS[key] || [])])];
    }
  }
  for (const [metro, members] of Object.entries(SEARCH_METRO_AREAS)) {
    if (normalizeLocationName(metro) === norm) {
      return [...new Set([metro, ...members])];
    }
  }
  return [term];
}
