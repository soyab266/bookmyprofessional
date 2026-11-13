import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(new URL("./alias-hooks.mjs", import.meta.url));
const {
  SERVICE_AREA_CITIES,
  canonicalServiceArea,
  sanitizeServiceAreas,
  servesArea,
} = await import("../src/lib/service-areas.js");
const { queryProfessionals } = await import("../src/lib/data/professionals.js");

test("the coverage cities offered for Areas served are the curated locations", () => {
  assert.deepEqual(SERVICE_AREA_CITIES, ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune"]);
});

test("canonicalServiceArea resolves coverage cities case-insensitively, including dropdown labels", () => {
  assert.equal(canonicalServiceArea("Hyderabad"), "Hyderabad");
  assert.equal(canonicalServiceArea("hyderabad"), "Hyderabad");
  assert.equal(canonicalServiceArea("  HYDERABAD "), "Hyderabad");
  assert.equal(canonicalServiceArea("Hyderabad, India"), "Hyderabad");
});

test("canonicalServiceArea never invents coverage for unlisted places", () => {
  assert.equal(canonicalServiceArea("K.V.Rangareddy"), null);
  assert.equal(canonicalServiceArea("Ranga Reddy"), null);
  assert.equal(canonicalServiceArea("Secunderabad"), null);
  assert.equal(canonicalServiceArea("Aligarh"), null);
  assert.equal(canonicalServiceArea("Bengaluru"), null); // rename, not a curated city spelling
  assert.equal(canonicalServiceArea(""), null);
  assert.equal(canonicalServiceArea(null), null);
});

test("sanitizeServiceAreas keeps only known cities, canonical, de-duplicated", () => {
  assert.deepEqual(sanitizeServiceAreas(["hyderabad", "Hyderabad", "Aligarh", "Pune"]), ["Hyderabad", "Pune"]);
  assert.deepEqual(sanitizeServiceAreas("Hyderabad"), []);
  assert.deepEqual(sanitizeServiceAreas(null), []);
  assert.deepEqual(sanitizeServiceAreas([]), []);
});

test("servesArea matches declared cities case-insensitively and nothing else", () => {
  const pro = { serviceAreas: ["Hyderabad", "Pune"] };
  assert.equal(servesArea(pro, "Hyderabad"), true);
  assert.equal(servesArea(pro, "hyderabad"), true);
  assert.equal(servesArea(pro, "Pune"), true);
  assert.equal(servesArea(pro, "Mumbai"), false);
  assert.equal(servesArea({ serviceAreas: [] }, "Hyderabad"), false);
  assert.equal(servesArea({}, "Hyderabad"), false);
  assert.equal(servesArea(null, "Hyderabad"), false);
  assert.equal(servesArea(pro, ""), false);
});

// Chainable stub of the supabase-js query builder recording filter calls.
function stubSupabase(rows, calls) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    ilike: (column, pattern) => { calls.push(["ilike", column, pattern]); return builder; },
    or: (filters) => { calls.push(["or", filters]); return builder; },
    gte: () => builder,
    gt: () => builder,
    lt: () => builder,
    lte: () => builder,
    contains: () => builder,
    order: () => builder,
    limit: () => builder,
    range: async () => ({ data: rows, error: null, count: rows.length }),
  };
  return { from: () => builder };
}

test("a coverage-city search matches stored city OR the pro's declared Areas served", async () => {
  const calls = [];
  const stub = stubSupabase([], calls);
  await queryProfessionals(stub, { location: "Hyderabad" });
  const orCall = calls.find(([kind]) => kind === "or");
  assert.ok(orCall, "expected an OR filter combining stored city and service areas");
  assert.equal(orCall[1], 'city.ilike.%Hyderabad%,service_areas.cs.{"Hyderabad"}');
  // No plain ilike on city when the OR form is used
  assert.equal(calls.filter(([kind, col]) => kind === "ilike" && col === "city").length, 0);
});

test("coverage-city matching is case-insensitive on the searched term", async () => {
  const calls = [];
  await queryProfessionals(stubSupabase([], calls), { location: "hyderabad" });
  const orCall = calls.find(([kind]) => kind === "or");
  assert.ok(orCall);
  assert.ok(orCall[1].includes('service_areas.cs.{"Hyderabad"}'));
});

test("a dropdown-label search (City, Country) also matches declared Areas served", async () => {
  const calls = [];
  await queryProfessionals(stubSupabase([], calls), { location: "Hyderabad, India" });
  const orCall = calls.find(([kind]) => kind === "or");
  assert.ok(orCall);
  assert.ok(orCall[1].includes('service_areas.cs.{"Hyderabad"}'));
});

test("cities outside the curated list keep exact literal matching with no service-area lookup", async () => {
  for (const place of ["Aligarh", "K.V.Rangareddy", "Secunderabad"]) {
    const calls = [];
    await queryProfessionals(stubSupabase([], calls), { location: place });
    assert.equal(calls.filter(([kind]) => kind === "or").length, 0, `no OR expected for ${place}`);
    const ilike = calls.find(([kind, col]) => kind === "ilike" && col === "city");
    assert.ok(ilike, `expected literal city ilike for ${place}`);
    assert.equal(ilike[2], `%${place}%`);
  }
});

test("a stored service_areas value maps onto the professional record", async () => {
  const row = {
    id: "p1",
    name: "Fixture Pro",
    category: "Electrician",
    city: "K.V.Rangareddy",
    pincode: "501218",
    service_areas: ["Hyderabad"],
    services: [],
    credentials: [],
    reviews: [],
  };
  const { rows } = await queryProfessionals(stubSupabase([row], []), { location: "Hyderabad" });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].serviceAreas, ["Hyderabad"]);
  // Stored address is preserved untouched
  assert.equal(rows[0].city, "K.V.Rangareddy");
});

test("before the schema is applied, a service_areas column error retries with the plain literal filter", async () => {
  const calls = [];
  const failing = {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        ilike: (column, pattern) => { calls.push(["ilike", column, pattern]); return builder; },
        or: (filters) => { calls.push(["or", filters]); return builder; },
        gte: () => builder, gt: () => builder, lt: () => builder, lte: () => builder,
        contains: () => builder, order: () => builder, limit: () => builder,
        range: async () => {
          if (calls.some(([kind, f]) => kind === "or" && String(f).includes("service_areas"))) {
            return { data: null, error: { message: "column professionals.service_areas does not exist" }, count: null };
          }
          return { data: [], error: null, count: 0 };
        },
      };
      return builder;
    },
  };
  const { rows, total } = await queryProfessionals(failing, { location: "Hyderabad" });
  // First attempt used the OR form, the retry fell back to the literal ilike
  const orCalls = calls.filter(([kind]) => kind === "or");
  const ilikeCity = calls.filter(([kind, col]) => kind === "ilike" && col === "city");
  assert.equal(orCalls.length, 1);
  assert.equal(ilikeCity.length, 1);
  assert.equal(ilikeCity[0][2], "%Hyderabad%");
  assert.deepEqual(rows, []);
  assert.equal(total, 0);
});

test("missing or malformed service_areas maps to an empty list", async () => {
  const base = { id: "p1", name: "Pro", category: "Plumber", city: "Pune", services: [], credentials: [], reviews: [] };
  const { rows: noField } = await queryProfessionals(stubSupabase([{ ...base }], []), {});
  assert.deepEqual(noField[0].serviceAreas, []);
  const { rows: badField } = await queryProfessionals(stubSupabase([{ ...base, service_areas: "Hyderabad" }], []), {});
  assert.deepEqual(badField[0].serviceAreas, []);
});
