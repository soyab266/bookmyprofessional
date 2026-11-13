import { createClient } from "@/lib/supabase/client";
import { parseInclusions } from "@/lib/inclusions";
import { validatePayoutDetails, getBankNameFromIFSC } from "@/lib/payout-validation";
import { sanitizeServiceAreas } from "@/lib/service-areas";

const EMPTY = { experienceYears: 0, specialty: "", city: "", pincode: "", category: "", subcategory: "", role_title: "", services: [], credentials: [], payout_details: null, serviceAreas: [] };
// ponytail: empty profile on error keeps the vendor page alive while supabase/schema.sql is unapplied.
export async function getVendorProfile(professionalId) {
  if (!professionalId) return { ...EMPTY };
  try {
    const supabase = createClient();
    const FULL_COLUMNS =
      "experience_years, specialty, city, name, image_url, verification_status, hourly_rate, category, subcategory, role_title, pincode, availability, payout_details, service_areas";
    const BASE_COLUMNS =
      "experience_years, specialty, city, name, image_url, verification_status, hourly_rate, category, availability";
    const [{ data: services }, { data: credentials }] = await Promise.all([
      supabase.from("services").select("*").eq("professional_id", professionalId).order("sort"),
      supabase.from("credentials").select("*").eq("professional_id", professionalId),
    ]);
    let { data: pro, error } = await supabase
      .from("professionals")
      .select(FULL_COLUMNS)
      .eq("id", professionalId)
      .maybeSingle();
    if (error || !pro) {
      // subcategory/role_title/pincode/payout_details column may not exist yet (schema not applied) — retry without them
      ({ data: pro } = await supabase
        .from("professionals")
        .select(BASE_COLUMNS)
        .eq("id", professionalId)
        .maybeSingle());
    }
    return {
      experienceYears: pro?.experience_years || 0,
      specialty: pro?.specialty || "",
      city: pro?.city || "",
      pincode: pro?.pincode || "",
      category: pro?.category || "",
      subcategory: pro?.subcategory || "",
      role_title: pro?.role_title || "",
      name: pro?.name || "",
      image_url: pro?.image_url || "",
      verification_status: pro?.verification_status || "not_submitted",
      hourlyRate: Number(pro?.hourly_rate) || 0,
      availability: pro?.availability || null,
      payout_details: pro?.payout_details || null,
      serviceAreas: Array.isArray(pro?.service_areas) ? pro.service_areas : [],
      services: services || [],
      credentials: credentials || [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function updateVendorBasics(professionalId, patch) {
  const supabase = createClient();
  const cleanPin = String(patch.pincode || "").replace(/\D/g, "").slice(0, 6);

  // Server-side pincode validation — must be 6 digits and exist in India Post
  if (cleanPin) {
    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      throw Object.assign(
        new Error("Pincode must be exactly 6 digits and cannot start with 0."),
        { isUserFacing: true, field: "pincode" }
      );
    }
    // Cross-check city against pincode via our API (server-to-server)
    if (patch.city?.trim()) {
      try {
        const origin = typeof window !== "undefined"
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
        const res = await fetch(
          `${origin}/api/location/verify-pincode?pincode=${cleanPin}&city=${encodeURIComponent(patch.city.trim())}`,
import { parseInclusions } from "@/lib/inclusions";
import { validatePayoutDetails, getBankNameFromIFSC } from "@/lib/payout-validation";
import { sanitizeServiceAreas } from "@/lib/service-areas";

const EMPTY = { experienceYears: 0, specialty: "", city: "", pincode: "", category: "", subcategory: "", role_title: "", services: [], credentials: [], payout_details: null, serviceAreas: [] };
// ponytail: empty profile on error keeps the vendor page alive while supabase/schema.sql is unapplied.
export async function getVendorProfile(professionalId) {
  if (!professionalId) return { ...EMPTY };
  try {
    const supabase = createClient();
    const FULL_COLUMNS =
      "experience_years, specialty, city, name, image_url, verification_status, hourly_rate, category, subcategory, role_title, pincode, availability, payout_details, service_areas";
    const BASE_COLUMNS =
      "experience_years, specialty, city, name, image_url, verification_status, hourly_rate, category, availability";
    const [{ data: services }, { data: credentials }] = await Promise.all([
      supabase.from("services").select("*").eq("professional_id", professionalId).order("sort"),
      supabase.from("credentials").select("*").eq("professional_id", professionalId),
    ]);
    let { data: pro, error } = await supabase
      .from("professionals")
      .select(FULL_COLUMNS)
      .eq("id", professionalId)
      .maybeSingle();
    if (error || !pro) {
      // subcategory/role_title/pincode/payout_details column may not exist yet (schema not applied) — retry without them
      ({ data: pro } = await supabase
        .from("professionals")
        .select(BASE_COLUMNS)
        .eq("id", professionalId)
        .maybeSingle());
    }
    return {
      experienceYears: pro?.experience_years || 0,
      specialty: pro?.specialty || "",
      city: pro?.city || "",
      pincode: pro?.pincode || "",
      category: pro?.category || "",
      subcategory: pro?.subcategory || "",
      role_title: pro?.role_title || "",
      name: pro?.name || "",
      image_url: pro?.image_url || "",
      verification_status: pro?.verification_status || "not_submitted",
      hourlyRate: Number(pro?.hourly_rate) || 0,
import { parseInclusions } from "@/lib/inclusions";
import { validatePayoutDetails, getBankNameFromIFSC } from "@/lib/payout-validation";
import { sanitizeServiceAreas } from "@/lib/service-areas";

const EMPTY = { experienceYears: 0, specialty: "", city: "", pincode: "", category: "", subcategory: "", role_title: "", services: [], credentials: [], payout_details: null, serviceAreas: [] };
// ponytail: empty profile on error keeps the vendor page alive while supabase/schema.sql is unapplied.
export async function getVendorProfile(professionalId) {
  if (!professionalId) return { ...EMPTY };
  try {
    const supabase = createClient();
    const FULL_COLUMNS =
      "experience_years, specialty, city, name, image_url, verification_status, hourly_rate, category, subcategory, role_title, pincode, availability, payout_details, service_areas";
    const BASE_COLUMNS =
      "experience_years, specialty, city, name, image_url, verification_status, hourly_rate, category, availability";
    const [{ data: services }, { data: credentials }] = await Promise.all([
      supabase.from("services").select("*").eq("professional_id", professionalId).order("sort"),
      supabase.from("credentials").select("*").eq("professional_id", professionalId),
    ]);
    let { data: pro, error } = await supabase
      .from("professionals")
      .select(FULL_COLUMNS)
      .eq("id", professionalId)
      .maybeSingle();
    if (error || !pro) {
      // subcategory/role_title/pincode/payout_details column may not exist yet (schema not applied) — retry without them
      ({ data: pro } = await supabase
        .from("professionals")
        .select(BASE_COLUMNS)
        .eq("id", professionalId)
        .maybeSingle());
    }
    return {
      experienceYears: pro?.experience_years || 0,
      specialty: pro?.specialty || "",
      city: pro?.city || "",
      pincode: pro?.pincode || "",
      category: pro?.category || "",
      subcategory: pro?.subcategory || "",
      role_title: pro?.role_title || "",
      name: pro?.name || "",
      image_url: pro?.image_url || "",
      verification_status: pro?.verification_status || "not_submitted",
      hourlyRate: Number(pro?.hourly_rate) || 0,
      availability: pro?.availability || null,
      payout_details: pro?.payout_details || null,
      serviceAreas: Array.isArray(pro?.service_areas) ? pro.service_areas : [],
      services: services || [],
      credentials: credentials || [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function updateVendorBasics(professionalId, patch) {
  const supabase = createClient();
  const cleanPin = String(patch.pincode || "").replace(/\D/g, "").slice(0, 6);

  // Server-side pincode validation — must be 6 digits and exist in India Post
  if (cleanPin) {
    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      throw Object.assign(
        new Error("Pincode must be exactly 6 digits and cannot start with 0."),
        { isUserFacing: true, field: "pincode" }
      );
    }
    // Cross-check city against pincode via our API (server-to-server)
    if (patch.city?.trim()) {
      try {
        const origin = typeof window !== "undefined"
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
        const res = await fetch(
          `${origin}/api/location/verify-pincode?pincode=${cleanPin}&city=${encodeURIComponent(patch.city.trim())}`,
          { headers: { Accept: "application/json" } }
        );
        const data = await res.json();
        if (data?.cityMismatch) {
          throw Object.assign(new Error(data.error || "City does not match pincode."), {
            isUserFacing: true, field: "city",
          });
        }
        // Not found at all
        if (!data?.valid && !data?.warning) {
          throw Object.assign(
            new Error(data?.error || `Invalid pincode: ${cleanPin} is not a recognised Indian PIN code.`),
            { isUserFacing: true, field: "pincode" }
          );
        }
      } catch (e) {
        if (e?.isUserFacing) throw e;
        // Postal API unreachable — don't block save, just skip city check
        console.warn("[updateVendorBasics] Postal API unreachable, skipping city check:", e?.message);
      }
    }
  }

  const cleanSub = patch.subcategory && patch.subcategory.trim() && patch.subcategory.toLowerCase() !== "professional"
    ? patch.subcategory.trim()
    : null;
  const cleanTitle = (patch.role_title || "").trim() || cleanSub || patch.category || "Professional";

  const row = {
    experience_years: Number(patch.experienceYears) || 0,
    specialty: patch.specialty || "",
    city: patch.city || "",
    hourly_rate: Number(patch.hourlyRate) || 0,
    category: patch.category || "",
    subcategory: cleanSub,
    role_title: cleanTitle,
  };
  let serviceAreasPersisted = true;
  let { error } = await supabase
    .from("professionals")
    .update({ ...row, pincode: cleanPin || "", service_areas: sanitizeServiceAreas(patch.serviceAreas) })
    .eq("id", professionalId);
  if (error) {
    // Any fallback save drops service_areas (e.g. column not yet applied) -
    // the caller must tell the user the area selection was NOT stored.
    serviceAreasPersisted = false;
    // If subcategory/role_title or pincode columns don't exist yet, retry with base fields
    const baseRow = {
      experience_years: Number(patch.experienceYears) || 0,
      specialty: patch.specialty || "",
      city: patch.city || "",
      hourly_rate: Number(patch.hourlyRate) || 0,
      category: patch.category || "",
    };
    ({ error } = await supabase.from("professionals").update(baseRow).eq("id", professionalId));
  }
  if (error) throw error;
  return {
    ...patch,
    subcategory: cleanSub,
    role_title: cleanTitle,
    pincode: cleanPin,
    serviceAreas: sanitizeServiceAreas(patch.serviceAreas),
    serviceAreasPersisted,
  };
}

export async function updateVendorSchedule(professionalId, availability) {
  const supabase = createClient();
  const { error } = await supabase
    .from("professionals")
    .update({ availability })
    .eq("id", professionalId);
  if (error) throw error;
  return availability;
}

export async function updateVendorPayoutDetails(professionalId, payoutDetails) {
  if (!professionalId) throw new Error("Professional ID is required.");
  const validation = validatePayoutDetails(payoutDetails);
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0] || "Invalid payout details.";
    throw Object.assign(new Error(firstErr), { isUserFacing: true, errors: validation.errors });
  }

  const supabase = createClient();
  const clean = {
    type: payoutDetails.type || (payoutDetails.upi_id ? "upi" : "bank"),
    account_holder: String(payoutDetails.account_holder || "").trim(),
    account_number: String(payoutDetails.account_number || "").trim(),
    ifsc_code: String(payoutDetails.ifsc_code || "").trim().toUpperCase(),
    bank_name: String(payoutDetails.bank_name || getBankNameFromIFSC(payoutDetails.ifsc_code) || "").trim(),
    upi_id: String(payoutDetails.upi_id || "").trim(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("professionals")
    .update({ payout_details: clean })
    .eq("id", professionalId);

  if (error) {
    console.error("[updateVendorPayoutDetails] Error saving payout details:", error);
    throw new Error(error.message || "Failed to save payout details.");
  }

  return clean;
}

export async function saveService(professionalId, service) {
  const row = {
    title: (service.title || "").trim(),
    description: service.description || "",
    price: Number(service.price) || 0,
    duration: service.duration || "",
  };
  if (!row.title) throw new Error("Service title is required.");
  const lists = {
    inclusions: parseInclusions(service.inclusions),
    exclusions: parseInclusions(service.exclusions),
  };

  const supabase = createClient();
  if (service.id) {
    let { error } = await supabase.from("services").update({ ...row, ...lists }).eq("id", service.id);
    if (error) {
      // inclusions column may not exist yet (schema not applied) — save the rest
      ({ error } = await supabase.from("services").update(row).eq("id", service.id));
    }
    if (error) throw error;
  } else {
    const { count } = await supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("professional_id", professionalId);
    let { error } = await supabase
      .from("services")
      .insert({ professional_id: professionalId, sort: count || 0, ...row, ...lists });
    if (error) {
      ({ error } = await supabase
        .from("services")
        .insert({ professional_id: professionalId, sort: count || 0, ...row }));
    }
    if (error) throw error;
  }
  return (await getVendorProfile(professionalId)).services;
}

export async function deleteService(professionalId, serviceId) {
  const supabase = createClient();
  const { error } = await supabase.from("services").delete().eq("id", serviceId);
  if (error) throw error;
  return (await getVendorProfile(professionalId)).services;
}

export async function saveCredential(professionalId, credential) {
  const row = {
    title: (credential.title || "").trim(),
    issuer: credential.issuer || "",
    year: credential.year || "",
  };
  if (!row.title) throw new Error("Qualification title is required.");

  const supabase = createClient();
  const { error } = await supabase
    .from("credentials")
    .insert({ professional_id: professionalId, ...row });
  if (error) throw error;
  return (await getVendorProfile(professionalId)).credentials;
}

export async function deleteCredential(professionalId, credentialId) {
  const supabase = createClient();
  const { error } = await supabase.from("credentials").delete().eq("id", credentialId);
  if (error) throw error;
  return (await getVendorProfile(professionalId)).credentials;
}
