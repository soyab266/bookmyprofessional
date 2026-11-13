import { NextResponse } from "next/server";
import { METRO_ALIASES, normalizeLocationName as stripSpecial } from "@/lib/location-aliases";

// In-memory cache: pincode → verified data (immutable from India Post)
const PINCODE_CACHE = new Map();

// Metro / large-city aliases — a user typing "Hyderabad" must match 501218's
// K.V.Rangareddy district. Shared with directory search in @/lib/location-aliases.

/**
 * Returns true if `inputCity` belongs to the set of valid cities for the pincode.
 * Uses district/region/block/post-office names from India Post, + metro aliases.
 */
function cityMatchesPincode(inputCity, postOffices) {
  const normInput = stripSpecial(inputCity);
  if (!normInput) return false;

  // Build a flat set of all place names from postal data
  const validNames = new Set();
  for (const po of postOffices) {
    if (po.District) validNames.add(stripSpecial(po.District));
    if (po.Block && po.Block !== "NA") validNames.add(stripSpecial(po.Block));
    if (po.Region) validNames.add(stripSpecial(po.Region.replace(/ Region| City/gi, "")));
    if (po.Division) validNames.add(stripSpecial(po.Division.replace(/ Division| South East| North/gi, "")));
    if (po.Name) validNames.add(stripSpecial(po.Name.replace(/\(.*\)/g, "").trim()));
    if (po.Circle) validNames.add(stripSpecial(po.Circle));
    if (po.State) validNames.add(stripSpecial(po.State));
  }

  // Direct match: input is a substring or equal to a valid name (or vice-versa)
  for (const vn of validNames) {
    if (!vn) continue;
    if (normInput === vn || normInput.includes(vn) || vn.includes(normInput)) {
      return true;
    }
  }

  // Metro alias match: check if any validName is an alias key, and if so, test input against its aliases
  for (const [key, aliases] of Object.entries(METRO_ALIASES)) {
    const normKey = stripSpecial(key);
    const validHasAlias = [...validNames].some(
      (vn) => aliases.some((a) => stripSpecial(a) === vn || vn.includes(stripSpecial(a)))
    );
    if (validHasAlias) {
      if (aliases.some((a) => stripSpecial(a) === normInput || normInput.includes(stripSpecial(a)))) {
        return true;
      }
    }
  }

  return false;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPincode = searchParams.get("pincode") || "";
    const rawCity    = searchParams.get("city") || "";
    const pincode    = String(rawPincode).trim().replace(/\D/g, "");

    // 1. Strict Format Validation: Indian PIN codes are exactly 6 digits, first digit 1-9
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return NextResponse.json(
        { valid: false, error: "Pincode must be exactly 6 digits and cannot start with 0.", pincode },
        { status: 400 }
      );
    }

    let postOffices = null;
    let cachedBase = null;

    // 2. Check Cache
    if (PINCODE_CACHE.has(pincode)) {
      cachedBase = PINCODE_CACHE.get(pincode);
      postOffices = cachedBase._postOffices || null;
    }

    // 3. Fetch from India Post if not cached
    if (!postOffices) {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 4000);
      let res;
      try {
        res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.warn(`[Pincode API] Timeout/network error for ${pincode}:`, fetchErr?.message);
        // Network failure: accept format-valid pincode with warning (don't block users on outage)
        const fallback = {
          valid: true, pincode, district: "", state: "", city: "", area: "",
          postOffices: [], warning: "Postal service unreachable; format verified only.",
        };
        return NextResponse.json(fallback);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        return NextResponse.json(
          { valid: false, error: "Unable to verify pincode at this moment.", pincode },
          { status: 502 }
        );
      }

      const json   = await res.json();
      const result = Array.isArray(json) ? json[0] : json;

      if (!result || result.Status !== "Success" || !Array.isArray(result.PostOffice) || !result.PostOffice.length) {
        const failure = { valid: false, error: `Invalid Pincode: No postal region found in India for ${pincode}.`, pincode };
        PINCODE_CACHE.set(pincode, failure);
        return NextResponse.json(failure, { status: 404 });
      }

      postOffices = result.PostOffice;
      const firstPo = postOffices[0];
      cachedBase = {
        valid:            true,
        pincode,
        district:         firstPo.District || "",
        state:            firstPo.State    || "",
        city:             firstPo.District || firstPo.Block || firstPo.Circle || "",
        area:             firstPo.Name     || "",
        region:           firstPo.Region   || "",
        country:          firstPo.Country  || "India",
        postOffices:      postOffices.map((po) => po.Name).filter(Boolean),
        formattedLocation:`${firstPo.Name}, ${firstPo.District}, ${firstPo.State}`,
        // Store raw array for city validation (not sent to client)
        _postOffices:     postOffices,
      };
      PINCODE_CACHE.set(pincode, cachedBase);
    }

    // 4. Optional city cross-check
    if (rawCity.trim()) {
      const cityValid = cityMatchesPincode(rawCity.trim(), postOffices || []);
      if (!cityValid) {
        const { _postOffices: _, ...safeBase } = cachedBase;
        return NextResponse.json(
          {
            ...safeBase,
            valid: false,
            cityMismatch: true,
            error: `City "${rawCity.trim()}" does not match pincode ${pincode}. The pincode belongs to ${cachedBase.district}${cachedBase.state ? `, ${cachedBase.state}` : ""}.`,
          },
          { status: 422 }
        );
      }
    }

    // 5. Return verified data (strip the internal _postOffices field)
    const { _postOffices: _ignored, ...safeData } = cachedBase;
    return NextResponse.json(safeData);
  } catch (error) {
    console.error("[Pincode Verify] Unexpected error:", error);
    return NextResponse.json(
      { valid: false, error: error?.message || "Internal server error verifying pincode" },
      { status: 500 }
    );
  }
}
