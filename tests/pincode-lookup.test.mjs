import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(new URL("./alias-hooks.mjs", import.meta.url));
const { mapProfessional, queryProfessionals, buildLocationMap } = await import("../src/lib/data/professionals.js");

const HYDERABAD_GPS = { latitude: 17.385, longitude: 78.4867 };
const LOCATIONS = [
  { city: "Mumbai", country: "India", latitude: 19.076, longitude: 72.8777 },
  { city: "Delhi", country: "India", latitude: 28.6139, longitude: 77.209 },
];
const PIN_ROWS = [
  { pincode: "501218", latitude: 17.2558, longitude: 78.3532 },
  { pincode: "400014", latitude: 19.0139, longitude: 72.847 },
];
const PRO_ROWS = [
  { id: "soyab", name: "Soyab Shekh", city: "Mumbai", pincode: "400014", is_active: true, verification_status: "approved", verified: true, reviews: [], services: [], credentials: [] },
  { id: "shanee", name: "shanee qureshi", city: "K.V.Rangareddy", pincode: "501218", is_active: true, verification_status: "approved", verified: true, reviews: [], services: [], credentials: [] },
  { id: "raveena", name: "Raveena", city: "delhi", pincode: "", is_active: true, verification_status: "approved", verified: true, reviews: [], services: [], credentials: [] },
  { id: "ghost", name: "No Where", city: "Nowhereville", pincode: "999999", is_active: true, verification_status: "approved", verified: true, reviews: [], services: [], credentials: [] },
];

// Chainable supabase stub: every filter/sort method returns itself; the
// terminal calls resolve per-table fixture data.
function stubSupabase({ proRows, pinRows, pinError = null, calls = [] }) {
  const chain = (table) => {
    const self = {
      select: () => self, eq: () => self, order: () => self,
      or: () => self, ilike: () => self, gte: () => self, lte: () => self,
      limit: async () => ({ data: proRows, error: null }),
      range: async () => ({ data: proRows, error: null, count: proRows.length }),
      in: async (col, values) => {
        calls.push({ table, col, values });
        if (pinError) return { data: null, error: pinError };
        return { data: pinRows.filter((r) => values.includes(r.pincode)), error: null };
      },
    };
    return self;
  };
  return { from: (table) => chain(table) };
}

test("mapProfessional fallback chain: profile > pincode > city > unknown", () => {
  const locMap = buildLocationMap(LOCATIONS);
  const pinMap = new Map(PIN_ROWS.map((r) => [r.pincode, r]));
  const own = mapProfessional({ id: "a", city: "Mumbai", pincode: "400014", latitude: 1, longitude: 2, reviews: [], services: [], credentials: [] }, locMap, pinMap);
  assert.deepEqual([own.latitude, own.longitude, own.distanceSource], [1, 2, "profile"]);
  const viaPin = mapProfessional({ id: "b", city: "K.V.Rangareddy", pincode: "501218", reviews: [], services: [], credentials: [] }, locMap, pinMap);
  assert.deepEqual([viaPin.latitude, viaPin.longitude, viaPin.distanceSource], [17.2558, 78.3532, "pincode"]);
  const viaCity = mapProfessional({ id: "c", city: "delhi", pincode: "", reviews: [], services: [], credentials: [] }, locMap, pinMap);
  assert.deepEqual([viaCity.distanceSource], ["city"]);
  const unknown = mapProfessional({ id: "d", city: "Nowhereville", pincode: "999999", reviews: [], services: [], credentials: [] }, locMap, pinMap);
  assert.deepEqual([unknown.latitude, unknown.longitude, unknown.distanceSource], [null, null, null]);
  // without a pinMap the behavior is exactly the old chain
  const legacy = mapProfessional({ id: "e", city: "K.V.Rangareddy", pincode: "501218", reviews: [], services: [], credentials: [] }, locMap);
  assert.deepEqual([legacy.latitude, legacy.distanceSource], [null, null]);
});

test("near-me sorts all pros nearest-first, pincode resolves off-list city, unknown last", async () => {
  const calls = [];
  const supabase = stubSupabase({ proRows: PRO_ROWS, pinRows: PIN_ROWS, calls });
  const result = await queryProfessionals(supabase, { near: HYDERABAD_GPS, locations: LOCATIONS });
  assert.deepEqual(result.rows.map((p) => p.id), ["shanee", "soyab", "raveena", "ghost"]);
  const soyab = result.rows.find((p) => p.id === "soyab");
  // pincode centroid must win over the city centroid when both exist (400014 vs Mumbai)
  assert.equal(soyab.distanceSource, "pincode");
  assert.deepEqual([soyab.latitude, soyab.longitude], [19.0139, 72.847]);
  const shanee = result.rows[0];
  assert.equal(shanee.distanceSource, "pincode");
  assert.ok(Math.round(shanee.latitude * 1000) === 17256, "pincode centroid applied");
  const ghost = result.rows[3];
  assert.equal(ghost.distanceSource, null);
  assert.ok(calls.some((c) => c.table === "pincodes_lookup"), "pincode lookup queried once");
});

test("missing pincode table degrades gracefully to city/unknown behavior", async () => {
  const supabase = stubSupabase({ proRows: PRO_ROWS, pinRows: [], pinError: { code: "42P01", message: "relation does not exist" } });
  const result = await queryProfessionals(supabase, { near: HYDERABAD_GPS, locations: LOCATIONS });
  // Shanee falls back to unknown (city not in locations); Mumbai/Delhi still sort by city centroid
  assert.deepEqual(result.rows.map((p) => p.id), ["soyab", "raveena", "shanee", "ghost"]);
  assert.equal(result.rows[2].distanceSource, null);
});

test("directory UI shows approximate label and explicit Distance unavailable", async () => {
  const { readFile } = await import("node:fs/promises");
  const component = await readFile(new URL("../src/components/MarketplaceDirectory.jsx", import.meta.url), "utf8");
  assert.match(component, /approximate area estimates/);
  assert.match(component, /Distance unavailable/);
  assert.match(component, /· ~\{distanceToUserKm/);
});
