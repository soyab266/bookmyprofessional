import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);

const { mapProfessional, buildLocationMap } = await import("../src/lib/data/professionals.js");
const { mergeDirectoryLocations } = await import("../src/lib/directory-locations.js");

const row = {
  id: "p1",
  name: "Example Engineer",
  city: "K.V.Rangareddy",
  hourly_rate: 500,
  reviews: [],
  services: [],
  credentials: [],
};

test("a directory-merged city without country never renders undefined", () => {
  // Browser listLocations() merges active professional cities that are missing
  // from the locations table; those entries have no country field.
  const merged = mergeDirectoryLocations(
    [{ id: "Hyderabad", label: "Hyderabad, India", city: "Hyderabad", country: "India" }],
    ["K.V.Rangareddy"]
  );
  const pro = mapProfessional(row, buildLocationMap(merged));
  assert.equal(pro.location, "K.V.Rangareddy");
  assert.ok(!/undefined|null/.test(pro.location));
});

test("a locations-table entry with a country keeps the full label", () => {
  const locs = [{ id: "Hyderabad", label: "Hyderabad, India", city: "Hyderabad", country: "India" }];
  const pro = mapProfessional({ ...row, city: "Hyderabad" }, buildLocationMap(locs));
  assert.equal(pro.location, "Hyderabad, India");
});

test("an unknown city falls back to the bare city name", () => {
  const pro = mapProfessional(row, buildLocationMap([]));
  assert.equal(pro.location, "K.V.Rangareddy");
});

test("a null country in a locations-table row also falls back to the city", () => {
  const locs = [{ id: "K.V.Rangareddy", label: "K.V.Rangareddy", city: "K.V.Rangareddy", country: null }];
  const pro = mapProfessional(row, buildLocationMap(locs));
  assert.equal(pro.location, "K.V.Rangareddy");
});
