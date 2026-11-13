// Metro / large-city alias groups shared by pincode verification and directory
// location search: a search for any name in a group matches the whole group,
// so a user searching "Hyderabad" also finds professionals listed under their
// stored "K.V.Rangareddy" district, and "Bangalore" finds "Bengaluru".
// Keep group members as plain place names; matching normalizes punctuation.
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

export function normalizeLocationName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// Every stored-city term a location search should match. A term that belongs to
// a metro group expands to that group; anything else passes through unchanged
// so cities outside the table keep their exact literal matching.
export function locationSearchTerms(value) {
  const term = String(value || "").trim();
  const norm = normalizeLocationName(term);
  if (!norm) return [];
  for (const group of Object.values(METRO_ALIASES)) {
    if (group.some((alias) => normalizeLocationName(alias) === norm)) {
      return [...new Set(group)];
    }
  }
  return [term];
}
