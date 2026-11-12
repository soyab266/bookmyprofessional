// Keep literal periods in stored city names such as K.V.Rangareddy.
// PostgREST punctuation that can change filter structure or wildcard meaning
// is still removed, matching the existing filter sanitization.
export function locationFilterTerm(value) {
  return String(value || "")
    .trim()
    .replace(/[,%()*:"]/g, " ")
    .trim();
}
