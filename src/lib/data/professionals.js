import { createClient } from "@/lib/supabase/client";
import { byPincodeProximity } from "@/lib/pincode";
import { byDistanceFrom } from "@/lib/geo";
import { listLocations, DEFAULT_LOCATIONS } from "./locations";

import { mapProfessional } from "../public-profile-view.js";
export { getProfessionalTitle } from "../public-profile-view.js";

export const DEFAULT_PAGE_SIZE = 8;

function buildLocationMap(locations) {
  const map = {};
  (locations || []).forEach((loc) => {
    if (loc.city) map[loc.city.toLowerCase()] = loc;
  });
  return map;
}

function withCoordinates(pro, locMap) {
  if (pro.latitude != null && pro.longitude != null) return pro;
  const city = (pro.city || (pro.location || "").split(",")[0] || "").trim();
  const loc = city ? locMap[city.toLowerCase()] : null;
  return {
    ...pro,
    city: pro.city || city || null,
    latitude: loc?.latitude ?? null,
    longitude: loc?.longitude ?? null,
  };
}

function sanitizeTerm(term) {
  return String(term || "")
    .trim()
    .replace(/[,.()%*:"]/g, " ")
    .trim();
}

// ponytail: ilike scan across name/role_title/category/specialty — no tsvector index yet.
// Swap for .textSearch()/an RPC over a generated tsvector column once the catalog is large.
function applySearch(query, term) {
  const q = sanitizeTerm(term);
  if (!q) return query;
  return query.or(
    ["name", "role_title", "category", "subcategory", "specialty"]
      .map((col) => `${col}.ilike.%${q}%`)
      .join(",")
  );
}

function applyFilters(query, opts) {
  let q = applySearch(query, opts.search);

  if (opts.category && opts.category !== "all") q = q.ilike("category", opts.category);
  const city = sanitizeTerm(opts.location === "all" ? "" : opts.location);
  if (city) q = q.ilike("city", `%${city}%`);
  const pincode = sanitizeTerm(opts.pincode);
  if (pincode) q = q.ilike("pincode", `%${pincode}%`);
  if (opts.minRating > 0) q = q.gte("rating", opts.minRating);
  if (opts.minExperience > 0) q = q.gte("experience_years", opts.minExperience);

  if (opts.priceRange === "under-40") q = q.lt("hourly_rate", 40);
  else if (opts.priceRange === "40-70") q = q.gte("hourly_rate", 40).lte("hourly_rate", 70);
  else if (opts.priceRange === "above-70") q = q.gt("hourly_rate", 70);

  const avail = {};
  if (opts.availabilityDay && opts.availabilityDay !== "all") avail.days = [opts.availabilityDay];
  if (opts.availabilitySlot && opts.availabilitySlot !== "all") avail.slots = [opts.availabilitySlot];
  if (Object.keys(avail).length) q = q.contains("availability", avail);

  return q;
}

const SORT_COLUMNS = {
  rating: ["rating", false],
  "price-asc": ["hourly_rate", true],
  "price-desc": ["hourly_rate", false],
  reviews: ["review_count", false],
  featured: ["created_at", false],
};

function applySort(query, sortBy) {
  const [col, asc] = SORT_COLUMNS[sortBy] || SORT_COLUMNS.featured;
  return query.order(col, { ascending: asc }).order("id", { ascending: true });
}

function clientFilter(rows, opts) {
  return rows.filter((pro) => {
    // Show all active professionals regardless of verification status — the badge reflects the real status
    if (pro.isActive === false) return false;

    if (opts.search && opts.search.trim()) {
      const q = opts.search.toLowerCase();
      const hay = [pro.name, pro.role, pro.category, pro.subcategory, pro.specialty, pro.location];
      if (!hay.some((v) => (v || "").toLowerCase().includes(q))) return false;
    }

    if (opts.category && opts.category !== "all") {
      if ((pro.category || "").toLowerCase() !== opts.category.toLowerCase()) return false;
    }

    if (opts.location && opts.location !== "all") {
      if (!(pro.location || "").toLowerCase().includes(opts.location.toLowerCase())) return false;
    }

    if (opts.pincode) {
      if (!(pro.pincode || "").includes(opts.pincode)) return false;
    }

    if (opts.availabilityDay && opts.availabilityDay !== "all") {
      const days = pro.availability?.days || [];
      if (!days.some((d) => d.toLowerCase() === opts.availabilityDay.toLowerCase())) return false;
    }

    if (opts.availabilitySlot && opts.availabilitySlot !== "all") {
      const slots = pro.availability?.slots || [];
      if (!slots.includes(opts.availabilitySlot)) return false;
    }

    if (opts.minRating > 0 && pro.rating < opts.minRating) return false;

    if (opts.minExperience > 0 && (pro.experienceYears || 0) < opts.minExperience) return false;

    if (opts.priceRange === "under-40" && pro.price >= 40) return false;
    if (opts.priceRange === "40-70" && (pro.price < 40 || pro.price > 70)) return false;
    if (opts.priceRange === "above-70" && pro.price <= 70) return false;

    return true;
  });
}

function clientSort(rows, sortBy) {
  const sorted = rows.slice();
  if (sortBy === "rating") sorted.sort((a, b) => b.rating - a.rating);
  else if (sortBy === "price-asc") sorted.sort((a, b) => a.price - b.price);
  else if (sortBy === "price-desc") sorted.sort((a, b) => b.price - a.price);
  else if (sortBy === "reviews") sorted.sort((a, b) => b.reviewCount - a.reviewCount);
  return sorted;
}

function fallbackList(seed, locations, opts, sortBy, page, pageSize, near = null) {
  const locMap = buildLocationMap(locations || DEFAULT_LOCATIONS);
  const all = (seed || []).map((pro) => {
    const p = withCoordinates(pro, locMap);
    return { ...p, ...summarizeReviews(p.reviews) };
  });
  let filtered = clientSort(clientFilter(all, opts), sortBy);
  let relaxedPincode = false;
  if (opts.pincode && filtered.length === 0) {
    // Nobody in the entered PIN — keep the other filters, drop the PIN and rank by postal proximity.
    filtered = clientSort(clientFilter(all, { ...opts, pincode: "" }), sortBy).sort(
      byPincodeProximity(opts.pincode)
    );
    relaxedPincode = true;
  }
  if (near) {
    filtered = filtered.slice().sort(byDistanceFrom(near));
  }
  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    relaxedPincode,
  };
}

// ponytail: mock seed fallback until supabase/schema.sql is applied and approved pros exist.
// Remove the seed fallback once the professionals table is populated in every environment.
export async function queryProfessionals(supabase, options = {}) {
  const {
    search = "",
    category = "all",
    location = "all",
    pincode = "",
    minRating = 0,
    minExperience = 0,
    priceRange = "all",
    sortBy = "featured",
    availabilityDay = "all",
    availabilitySlot = "all",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    seed = [],
    locations = null,
    near = null,
  } = options;

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE);
  const opts = {
    search,
    category,
    location,
    // Near-me supersedes the pincode filter — distance already orders the results.
    pincode: near ? "" : pincode,
    minRating,
    minExperience,
    priceRange,
    availabilityDay,
    availabilitySlot,
  };

  try {
    let query = supabase
      .from("professionals")
      .select("*, services(*), credentials(*), reviews(*)", { count: "exact" })
      .eq("is_active", true);

    query = applyFilters(query, opts);
    query = applySort(query, sortBy);

    if (near) {
      // ponytail: nearest-first needs the whole filtered set client-side (500-row cap).
      // Swap for a PostGIS/RPC distance order once the catalog outgrows it.
      const { data: nearby, error: nearbyError } = await query.limit(500);
      if (!nearbyError && nearby && nearby.length > 0) {
        const locs = locations || (await listLocations());
        const locMap = buildLocationMap(locs);
        const rows = nearby
          .map((row) => mapProfessional(row, locMap))
          .sort(byDistanceFrom(near));
        const start = (safePage - 1) * safeSize;
        return {
          rows: rows.slice(start, start + safeSize),
          total: rows.length,
          page: safePage,
          pageSize: safeSize,
          relaxedPincode: false,
        };
      }
    } else {
      const from = (safePage - 1) * safeSize;
      const { data, error, count } = await query.range(from, from + safeSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        const locs = locations || (await listLocations());
        const locMap = buildLocationMap(locs);
        return {
          rows: data.map((row) => mapProfessional(row, locMap)),
          total: typeof count === "number" ? count : data.length,
          page: safePage,
          pageSize: safeSize,
          relaxedPincode: false,
        };
      }
    }

    if (pincode && !near) {
      // ponytail: nobody in the entered PIN — refetch without it and rank by postal
      // proximity client-side (500-row cap). Move to an RPC when the catalog grows.
      let nearbyQuery = supabase
        .from("professionals")
        .select("*, services(*), credentials(*), reviews(*)")
        .eq("is_active", true);
      nearbyQuery = applyFilters(nearbyQuery, { ...opts, pincode: "" });
      nearbyQuery = applySort(nearbyQuery, sortBy);
      const { data: nearby, error: nearbyError } = await nearbyQuery.limit(500);
      if (!nearbyError && nearby && nearby.length > 0) {
        const locs = locations || (await listLocations());
        const locMap = buildLocationMap(locs);
        const rows = nearby
          .map((row) => mapProfessional(row, locMap))
          .sort(byPincodeProximity(pincode));
        const start = (safePage - 1) * safeSize;
        return {
          rows: rows.slice(start, start + safeSize),
          total: rows.length,
          page: safePage,
          pageSize: safeSize,
          relaxedPincode: true,
        };
      }
    }
  } catch {
    // fall through to the seed fallback below
  }

  return fallbackList(seed, locations, opts, sortBy, safePage, safeSize, near);
}

// ponytail: in browser, fetches through /api/professionals so admin service role can bypass RLS
// and show all active professionals with honest verification status badges.
export async function listProfessionals(options = {}) {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams();
      if (options.search) params.set("search", options.search);
      if (options.category && options.category !== "all") params.set("category", options.category);
      if (options.location && options.location !== "all") params.set("location", options.location);
      if (options.pincode) params.set("pincode", options.pincode);
      if (options.minRating) params.set("minRating", String(options.minRating));
      if (options.minExperience) params.set("minExperience", String(options.minExperience));
      if (options.priceRange && options.priceRange !== "all") params.set("priceRange", options.priceRange);
      if (options.sortBy) params.set("sortBy", options.sortBy);
      if (options.availabilityDay && options.availabilityDay !== "all") params.set("availabilityDay", options.availabilityDay);
      if (options.availabilitySlot && options.availabilitySlot !== "all") params.set("availabilitySlot", options.availabilitySlot);
      if (options.page) params.set("page", String(options.page));
      if (options.pageSize) params.set("pageSize", String(options.pageSize));
      if (options.near) {
        const lat = options.near.latitude ?? options.near.lat;
        const lng = options.near.longitude ?? options.near.lng;
        if (lat != null && lng != null) {
          params.set("nearLat", String(lat));
          params.set("nearLng", String(lng));
        }
      }

      const res = await fetch(`/api/professionals?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.rows)) {
          return data;
        }
      }
    } catch (e) {
      console.warn("API /api/professionals request failed, falling back to direct query", e);
    }
  }

  const supabase = createClient();
  return queryProfessionals(supabase, options);
}
