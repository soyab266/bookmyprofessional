import { test } from "node:test";
import assert from "node:assert/strict";
import { DIRECTORY_FIELDS, directoryCard, readPublicDirectory } from "../src/lib/public-directory.js";
const id = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
const options = (data, range = "0-0/1", status = 200, inspect = () => {}) => ({
  url: "https://example.invalid", anonKey: "fixture-key",
  fetcher: async (url, init) => { inspect(url, init); return new Response(JSON.stringify(data), { status, headers: { "content-range": range } }); },
});
test("public server read is bounded, active-only, no-store, deterministic and category aware", async () => {
  const result = await readPublicDirectory("Doctor", options([{ id, name: "Example Doctor", city: "K.V.Rangareddy" }], "0-0/9", 200, (url, init) => {
    assert.equal(url.searchParams.get("select"), DIRECTORY_FIELDS);
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    assert.equal(url.searchParams.get("category"), "ilike.Doctor");
    assert.equal(url.searchParams.get("limit"), "8");
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.asc");
    assert.equal(init.cache, "no-store");
    assert.ok(init.signal instanceof AbortSignal);
  }));
  assert.equal(result.status, "ready"); assert.equal(result.total, 9);
  assert.equal(result.rows[0].location, "K.V.Rangareddy");
  for (const field of ["email", "phone", "credentials", "about", "availability"]) assert.ok(!DIRECTORY_FIELDS.includes(field));
  assert.ok(!DIRECTORY_FIELDS.includes("reviews(*)"));
});
test("mapping preserves public card title and review-derived rating without serializing extra fields", () => {
  const row = directoryCard({ id, name: "Example", category: "Doctor", subcategory: "Gynaecologist", hourly_rate: 1000, reviews: [{ rating: 4 }, { rating: 5 }], services: [{ id: "s", privateField: "drop" }], email: "private" });
  assert.equal(row.role, "Gynaecologist"); assert.equal(row.price, 1000);
  assert.equal(row.rating, 4.5); assert.equal(row.reviewCount, 2);
  assert.equal(row.email, undefined); assert.equal(row.reviews, undefined);
  assert.deepEqual(row.services, [{ id: "s" }]);
});
test("confirmed empty is distinct from failure, malformed data, missing configuration and count", async () => {
  assert.deepEqual((await readPublicDirectory("all", options([], "*/0"))).status, "ready");
  for (const opts of [options([], "*/0", 500), options([], null), options([{ id: "bad" }]), options([], "*/8"), { url: "", anonKey: "" }, { url: "https://example.invalid", anonKey: "x", fetcher: async () => { throw Error("offline"); } }]) {
    const result = await readPublicDirectory("all", opts);
    assert.equal(result.status, "unavailable"); assert.equal(result.total, null);
  }
});

test("directory snapshot ends on a completed live read, not on rows being nonempty", async () => {
  const { readFile } = await import("node:fs/promises");
  const component = await readFile(new URL("../src/components/MarketplaceDirectory.jsx", import.meta.url), "utf8");
  const context = await readFile(new URL("../src/context/MarketplaceContext.jsx", import.meta.url), "utf8");
  assert.match(component, /directoryReadVersion === 0 && !initialSnapshotRetired/);
  assert.match(component, /setInitialSnapshotRetired\(true\)/);
  assert.match(context, /setDirectoryReadVersion\(\(version\) => version \+ 1\)/);
  assert.match(component, /The directory is temporarily unavailable/);
});
