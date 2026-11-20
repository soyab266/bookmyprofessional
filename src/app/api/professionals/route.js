import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { queryProfessionals, mapProfessional, buildLocationMap } from "@/lib/data/professionals";
import { listLocations } from "@/lib/data/locations";

export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Single-profile read for the detail page's confirmation fallback.
    const id = searchParams.get("id");
    if (id) {
      const { data, error } = await supabase
        .from("professionals")
        .select("*, services(*), credentials(*), reviews(*)")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 1, relaxedPincode: false });
      }
      const locs = await listLocations();
      return NextResponse.json({
        rows: [mapProfessional(data, buildLocationMap(locs))],
        total: 1,
        page: 1,
        pageSize: 1,
        relaxedPincode: false,
      });
    }

    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "all";
    const location = searchParams.get("location") || "all";
    const pincode = searchParams.get("pincode") || "";
    const minRating = Number(searchParams.get("minRating")) || 0;
    const minExperience = Number(searchParams.get("minExperience")) || 0;
    const priceRange = searchParams.get("priceRange") || "all";
    const sortBy = searchParams.get("sortBy") || "featured";
    const availabilityDay = searchParams.get("availabilityDay") || "all";
    const availabilitySlot = searchParams.get("availabilitySlot") || "all";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.max(1, Number(searchParams.get("pageSize")) || 8);
    const nearLat = searchParams.get("nearLat");
    const nearLng = searchParams.get("nearLng");
    const near = nearLat && nearLng ? { latitude: Number(nearLat), longitude: Number(nearLng) } : null;
    // Public browse directory excludes unverified professionals; featured/homepage reads omit this flag.
    const verifiedOnly = searchParams.get("verifiedOnly") === "true";

    const result = await queryProfessionals(supabase, {
      search,
      category,
      location,
      pincode,
      minRating,
      minExperience,
      priceRange,
      sortBy,
      availabilityDay,
      availabilitySlot,
      page,
      pageSize,
      near,
      verifiedOnly,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error in /api/professionals:", err);
    return NextResponse.json({ error: "Failed to fetch professionals", rows: [], total: 0 }, { status: 500 });
  }
}
