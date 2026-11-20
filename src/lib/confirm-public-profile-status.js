// Server existence confirmation only. Anonymous RLS can hide a real pending
// profile, so an empty anonymous response is not evidence of absence.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function confirmPublicProfileStatus(id, { readAnonymousStatus, createAdminClient }) {
  const status = await readAnonymousStatus(id);
  if (status !== "missing") return status;
  // Preserve legacy name-path/client fallback without scanning private rows.
  if (!UUID.test(id || "")) return "unknown";
  try {
    const { data, error } = await createAdminClient()
      .from("professionals")
      .select("id")
      .eq("id", id)
      .eq("is_active", true)
      .limit(1)
      .abortSignal(AbortSignal.timeout(2500));
    if (error || !Array.isArray(data) || data.length > 1) return "unknown";
    if (data.length === 0) return "missing";
    return typeof data[0]?.id === "string" && data[0].id.toLowerCase() === id.toLowerCase() ? "found" : "unknown";
  } catch {
    return "unknown";
  }
}
