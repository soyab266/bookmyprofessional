import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPublicProfileBody, PUBLIC_BODY_FIELDS } from "../src/lib/profile-body.js";
import { mapProfessional, getProfessionalTitle } from "../src/lib/public-profile-view.js";

const id = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
const row = {
  id, name: "Example Doctor", role_title: "Doctor", category: "Doctor", subcategory: "Gynaecologist",
  city: "Example City", is_active: true, verified: false, verification_status: "pending",
  hourly_rate: "1000", experience_years: 8, bio: "A public biography.",
  services: [{ id: "service-example", title: "Public consultation", price: "500", duration: "60 mins", sort: 0 }],
  credentials: [{ title: "Declared degree", issuer: "Example Institution", year: "2020" }],
  reviews: [{ id: "review-example", rating: 4, comment: "A public approved review", created_at: "2026-01-01" }],
  // Even unexpected fields from the source must not become client props.
  email: "must-not-pass@example.com", phone: "private-phone", documents: ["private-doc"], bank_account: "private-bank",
};
const opts = { url: "https://example.supabase.co/", anonKey: "dummy-public-key" };
const ok = (data) => ({ ok: true, json: async () => data });

test("public body selects exact active UUID, safe fields and only approved reviews using anonymous no-store GET", async () => {
  let calls = 0;
  const pro = await readPublicProfileBody(id, { ...opts, fetcher: async (url, options) => {
    calls++;
    assert.deepEqual(options.headers, { apikey: opts.anonKey, Authorization: `Bearer ${opts.anonKey}` });
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    assert.doesNotMatch(PUBLIC_BODY_FIELDS, /\*|email|phone|customer_id|booking_id|documents|bank|payout|profiles\(/);
    if (url.pathname.endsWith("/professionals")) {
      assert.equal(url.searchParams.get("select"), PUBLIC_BODY_FIELDS);
      assert.equal(url.searchParams.get("id"), `eq.${id}`);
      assert.equal(url.searchParams.get("is_active"), "eq.true");
      assert.equal(url.searchParams.get("reviews.status"), "eq.approved");
      assert.equal(url.searchParams.get("limit"), "1");
      return ok([row]);
    }
    assert.equal(url.pathname, "/rest/v1/locations");
    assert.equal(url.searchParams.get("select"), "city,country");
    assert.equal(url.searchParams.get("city"), "eq.Example City");
    return ok([{ city: row.city, country: "India" }]);
  } });
  assert.equal(calls, 2);
  assert.equal(pro.location, "Example City, India");
  assert.equal(pro.role, "Gynaecologist");
  assert.equal(pro.price, 1000);
  assert.equal(pro.services[0].price, 500);
  assert.equal(pro.reviewCount, 1);
  assert.equal(pro.rating, 4);
  assert.equal(pro.verified, false);
  assert.equal(pro.verificationStatus, "pending");
  assert.doesNotMatch(JSON.stringify(pro), /must-not-pass|private-phone|private-doc|private-bank/);
  assert.doesNotThrow(() => JSON.stringify(pro));
});

test("missing, inactive, wrong-ID, invalid payload, HTTP and timeout reads retain null client fallback", async () => {
  for (const fetcher of [
    async () => ok([]), async () => ok([{ ...row, is_active: false }]),
    async () => ok([{ ...row, id: "another-id" }]), async () => ok({ error: "not a list" }),
    async () => ok([{ ...row, name: null }]), async () => ({ ok: false }),
    async () => { throw new Error("timeout"); },
  ]) assert.equal(await readPublicProfileBody(id, { ...opts, fetcher }), null);
  const mustNotFetch = () => { throw new Error("must not fetch"); };
  assert.equal(await readPublicProfileBody("invalid", { ...opts, fetcher: mustNotFetch }), null);
  assert.equal(await readPublicProfileBody(id, { url: "", anonKey: "", fetcher: mustNotFetch }), null);
});

test("location failure does not hide real profile or invent a different city", async () => {
  const pro = await readPublicProfileBody(id, { ...opts, fetcher: async (url) => {
    if (url.pathname.endsWith("/professionals")) return ok([row]);
    throw new Error("location timeout");
  } });
  assert.equal(pro.location, row.city);
});

test("shared display mapper keeps honest roles, ratings, service order and verification state", () => {
  assert.equal(getProfessionalTitle({ subcategory: "Professional", category: "Engineer" }), "Engineer");
  const pro = mapProfessional({ ...row, reviews: [], verified: true, verification_status: "not_submitted",
    services: [{ title: "second", sort: 2 }, { title: "first", sort: 1 }] });
  assert.equal(pro.verified, false);
  assert.equal(pro.rating, 0);
  assert.equal(pro.reviewCount, 0);
  assert.deepEqual(pro.services.map((s) => s.title), ["first", "second"]);
});

test("server route supplies public data to the existing client UI; directory still uses same mapper", async () => {
  const server = await readFile(new URL("../src/app/professionals/[id]/page.jsx", import.meta.url), "utf8");
  const client = await readFile(new URL("../src/app/professionals/[id]/ProfessionalDetailClient.jsx", import.meta.url), "utf8");
  const directory = await readFile(new URL("../src/lib/data/professionals.js", import.meta.url), "utf8");
  assert.doesNotMatch(server, /use client/);
  assert.match(server, /await readPublicProfileBody\(id\)/);
  assert.match(client, /initialProfile\?\.id === proId/);
  assert.match(client, /getNextAvailableSlot/);
  assert.match(client, /onClick=\{toggleSave\}/);
  assert.match(directory, /import \{ mapProfessional \} from "\.\.\/public-profile-view.js"/);
});
