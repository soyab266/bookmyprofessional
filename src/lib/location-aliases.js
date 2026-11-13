// Place-name groupings for location matching.
//
// METRO_ALIASES is the developer's original pincode-verification table
// (src/app/api/location/verify-pincode/route.js), kept here verbatim so
// pincode city validation keeps its existing behavior.
//
// Directory location search deliberately uses NARROWER groupings:
// - SEARCH_NAME_ALIASES: documented official renames of the same city
//   (Mumbai/Bombay 1995, Chennai/Madras 1996, Kolkata/Calcutta 2001,
//   Bengaluru/Bangalore 2014, Gurugram/Gurgaon 2016). Symmetric.
// - SEARCH_METRO_AREAS: directional - searching the metro also matches stored
//   area/district names that are part of that metro, each grounded:
//   Hyderabad: Secunderabad (twin city, merged urban agglomeration),
//   Cyberabad (Hyderabad IT-corridor area), (K.V.)Rangareddy/Ranga Reddy
//   (district carved out of Hyderabad district; the site owner confirmed the
//   current Ranga Reddy profiles belong to the Hyderabad area), Shamshabad
//   (Ranga Reddy mandal in the Hyderabad metropolitan area).
//   Mumbai: Mumbai City + Mumbai Suburban districts together form the
//   metropolis. Delhi: New Delhi and the districts of NCT Delhi.
//   Bangalore: Bengaluru Urban district contains Bengaluru city.
//   The reverse is NOT widened: selecting an area or district stays literal.
// Separate cities near a metro (Thane, Navi Mumbai, Howrah, Pimpri-Chinchwad,
// Greater Noida, Medchal, Bengaluru Rural) and Gautam Buddha Nagar (a
//   district containing both Noida and Greater Noida) are excluded.

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
  kolkata:   ["kolkata", "calcutta"],
  chennai:   ["chennai", "madras"],
  gurgaon:   ["gurgaon", "gurugram"],
};

export const SEARCH_METRO_AREAS = {
  hyderabad: ["secunderabad", "cyberabad", "rangareddy", "kvrangareddy", "ranga reddy", "shamshabad"],
  mumbai:    ["mumbai city", "mumbai suburban"],
  delhi:     ["new delhi", "central delhi", "south delhi", "north delhi", "east delhi", "west delhi"],
  bangalore: ["bengaluru urban"],
};

export function normalizeLocationName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// Every stored-city term a location search should match:
// - a searched metro expands to its official rename plus its grounded
//   area/district names (Hyderabad -> ...rangareddy..., Delhi -> new delhi);
// - an area/district name searched directly (K.V.Rangareddy, New Delhi) and
//   any city outside the tables (Noida, Aligarh) pass through unchanged.
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
