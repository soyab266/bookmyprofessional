import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readActiveProfessionalCities, mergeDirectoryLocations } from "../src/lib/directory-locations.js";

function fixture(pages, error = null) {
  const calls = [];
  const client = { from(table) {
    calls.push(["from", table]);
    const q = {};
    for (const op of ["select", "eq", "order"]) q[op] = (...args) => { calls.push([op, ...args]); return q; };
    q.range = async (from, to) => { calls.push(["range", from, to]); return { data: pages.shift(), error }; };
    return q;
  }};
  return { client, calls };
}

test("city-only active query pages past the first response and keeps dotted names", async () => {
  const { client, calls } = fixture([[{ city: "K.V.Rangareddy" }, { city: "K.V.Rangareddy" }], [{ city: "New Delhi" }]]);
  assert.deepEqual(await readActiveProfessionalCities(client, 2), ["K.V.Rangareddy", "New Delhi"]);
  assert.deepEqual(calls.filter(c => c[0] === "range"), [["range", 0, 1], ["range", 2, 3]]);
  assert.ok(calls.filter(c => c[0] === "select").every(c => c[1] === "city"));
  assert.ok(calls.filter(c => c[0] === "eq").every(c => c[1] === "is_active" && c[2] === true));
});

test("blank cities are ignored and database failures are not passed off as complete", async () => {
  assert.deepEqual(await readActiveProfessionalCities(fixture([[{ city: null }, { city: "  " }, { city: " New Delhi " }]]).client), ["New Delhi"]);
  await assert.rejects(readActiveProfessionalCities(fixture([], new Error("offline")).client), /offline/);
});

test("merge preserves seed metadata, avoids duplicate cities, and does not alias Hyderabad", () => {
  const seed = [{ id: "Hyderabad", city: "Hyderabad", label: "Hyderabad, India", latitude: 17 }];
  const copy = structuredClone(seed);
  const result = mergeDirectoryLocations(seed, ["hyderabad", "K.V.Rangareddy", "K.V.Rangareddy"]);
  assert.deepEqual(seed, copy);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], seed[0]);
  assert.deepEqual(result[1], { id: "K.V.Rangareddy", label: "K.V.Rangareddy", city: "K.V.Rangareddy" });
});

test("fresh location loader retains five-minute cache and does not enable full catalog on directory", async () => {
  const loader = await readFile(new URL("../src/lib/data/locations.js", import.meta.url), "utf8");
  const context = await readFile(new URL("../src/context/MarketplaceContext.jsx", import.meta.url), "utf8");
  assert.match(loader, /readActiveProfessionalCities\(createClient\(\)\)/);
  assert.match(loader, /5 \* 60 \* 1000/);
  assert.doesNotMatch(loader, /createAdminClient|services\(\*\)/);
  assert.match(context, /if \(!needsCatalog\) return/);
});
