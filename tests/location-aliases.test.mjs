import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { locationSearchTerms, normalizeLocationName } from "../src/lib/location-aliases.js";

register(new URL("./alias-hooks.mjs", import.meta.url));
const { queryProfessionals } = await import("../src/lib/data/professionals.js");

test("normalizeLocationName folds case, spaces and punctuation", () => {
  assert.equal(normalizeLocationName("K.V.Rangareddy"), "kvrangareddy");
  assert.equal(normalizeLocationName("  New Delhi "), "newdelhi");
  assert.equal(normalizeLocationName("Ranga Reddy"), "rangareddy");
  assert.equal(normalizeLocationName(""), "");
});

test("a metro search expands to its alternate names and area/district names", () => {
  const hyderabad = locationSearchTerms("Hyderabad");
  assert.ok(hyderabad.includes("hyderabad"));
  assert.ok(hyderabad.includes("rangareddy"));
  assert.ok(hyderabad.includes("ranga reddy"));
  assert.ok(hyderabad.includes("secunderabad"));

  const bangalore = locationSearchTerms("Bangalore");
  assert.ok(bangalore.includes("bengaluru"));
  assert.ok(bangalore.includes("bengaluru urban"));
  assert.deepEqual(locationSearchTerms("Bengaluru"), bangalore);

  const mumbai = locationSearchTerms("Mumbai");
  assert.ok(mumbai.includes("bombay"));
  assert.ok(mumbai.includes("mumbai suburban"));

  const delhi = locationSearchTerms("Delhi");
  assert.ok(delhi.includes("new delhi"));
  assert.ok(delhi.includes("south delhi"));
});

test("search expansion never crosses into separate neighbouring cities", () => {
  for (const separate of ["Thane", "Navi Mumbai", "Howrah", "Pimpri-Chinchwad", "Greater Noida", "Medchal", "Bengaluru Rural"]) {
    assert.deepEqual(locationSearchTerms(separate), [separate]);
  }
  for (const term of locationSearchTerms("Mumbai")) assert.ok(!["thane", "navi mumbai"].includes(term));
  for (const term of locationSearchTerms("Kolkata")) assert.notEqual(term, "howrah");
  for (const term of locationSearchTerms("Pune")) assert.notEqual(term, "pimpri-chinchwad");
  for (const term of locationSearchTerms("Hyderabad")) assert.notEqual(term, "medchal");
  // New Delhi is part of Delhi but not the whole of it, and Gautam Buddha
  // Nagar holds both Noida and Greater Noida - both stay literal.
  assert.deepEqual(locationSearchTerms("New Delhi"), ["New Delhi"]);
  assert.deepEqual(locationSearchTerms("Noida"), ["Noida"]);
  for (const term of locationSearchTerms("Delhi")) assert.notEqual(term, "gautam buddha nagar");
});

test("area and district names searched directly stay literal (no reverse widening)", () => {
  assert.deepEqual(locationSearchTerms("K.V.Rangareddy"), ["K.V.Rangareddy"]);
  assert.deepEqual(locationSearchTerms("Ranga Reddy"), ["Ranga Reddy"]);
  assert.deepEqual(locationSearchTerms("Secunderabad"), ["Secunderabad"]);
});

test("cities outside the alias table pass through unchanged", () => {
  assert.deepEqual(locationSearchTerms("Aligarh"), ["Aligarh"]);
  assert.deepEqual(locationSearchTerms("  St. Thomas Mount "), ["St. Thomas Mount"]);
  assert.deepEqual(locationSearchTerms(""), []);
  assert.deepEqual(locationSearchTerms(null), []);
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

const RANGAREDDY_ROW = {
  id: "22525cf7-47b7-4960-8158-ebcf0c8f1c71",
  name: "Example Professional",
  city: "K.V.Rangareddy",
  services: [],
  credentials: [],
  reviews: [],
};

test("querying Hyderabad filters city by every Hyderabad-group term, matching K.V.Rangareddy", async () => {
  const calls = [];
  const result = await queryProfessionals(stubSupabase([RANGAREDDY_ROW], calls), {
    location: "Hyderabad",
    locations: [],
  });
  assert.equal(result.total, 1);
  const cityOr = calls.find(([kind, filters]) => kind === "or" && filters.includes("city.ilike"));
  assert.ok(cityOr, "expected an or-filter over city aliases");
  assert.ok(cityOr[1].includes("city.ilike.%hyderabad%"));
  assert.ok(cityOr[1].includes("city.ilike.%rangareddy%"));
  assert.ok(cityOr[1].includes("city.ilike.%ranga reddy%"));
  assert.ok(!calls.some(([kind, column]) => kind === "ilike" && column === "city"));
  // every pattern the filter emits matches the stored district spelling
  const patterns = [...cityOr[1].matchAll(/city\.ilike\.%([^%]+)%/g)].map((m) => m[1]);
  assert.ok(patterns.some((p) => "k.v.rangareddy".includes(p)));
});

test("selecting the stored district name itself stays a literal match", async () => {
  const calls = [];
  await queryProfessionals(stubSupabase([RANGAREDDY_ROW], calls), {
    location: "K.V.Rangareddy",
    locations: [],
  });
  assert.deepEqual(
    calls.filter(([kind, column]) => kind === "ilike" && column === "city"),
    [["ilike", "city", "%K.V.Rangareddy%"]]
  );
  assert.ok(!calls.some(([kind]) => kind === "or"));
});

test("a city outside the alias table keeps the single literal filter", async () => {
  const calls = [];
  await queryProfessionals(stubSupabase([RANGAREDDY_ROW], calls), {
    location: "Aligarh",
    locations: [],
  });
  assert.deepEqual(
    calls.filter(([kind, column]) => kind === "ilike" && column === "city"),
    [["ilike", "city", "%Aligarh%"]]
  );
  assert.ok(!calls.some(([kind]) => kind === "or"));
});

test("location 'all' applies no city filter", async () => {
  const calls = [];
  await queryProfessionals(stubSupabase([RANGAREDDY_ROW], calls), {
    location: "all",
    locations: [],
  });
  assert.ok(!calls.some(([kind, column]) => (kind === "ilike" && column === "city") || kind === "or"));
});
