// Pure view-state resolver for /professionals/[id]. Dependency-free so node
// tests can import it (the page and context use "@/..." aliases).

export const PROFILE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A profile page is only "missing" once an authoritative read confirms absence:
// the shared catalog (isCatalogLoading) followed, for UUID ids, by a direct
// by-id read (directStatus). While either is pending the page is "loading",
// and a failed read is "unavailable" — never "missing": a network, server or
// permissions failure is not evidence that the profile does not exist.
export function profileViewState({
  catalogPro = null,
  directPro = null,
  directStatus = null, // null = not attempted | "found" | "missing" | "unknown"
  isCatalogLoading = true,
  proId = "",
} = {}) {
  if (catalogPro || directPro) return "found";
  if (isCatalogLoading) return "loading";
  if (PROFILE_ID_RE.test(proId || "")) {
    if (!directStatus) return "loading";
    if (directStatus === "unknown") return "unavailable";
    return "missing";
  }
  return "missing";
}
