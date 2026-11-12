import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfileMetadata, readPublicProfileMetadata } from "../src/lib/profile-metadata.js";

const id = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
const origin = "https://www.bookmyprofessional.com";
const fixture = { id, name: "Example Doctor", role_title: "Doctor", subcategory: "Gynaecologist", category: "Doctor", city: "K.V.Rangareddy" };

test("title, description and share metadata use public name, role and actual city", () => {
  const m = buildProfileMetadata(id, fixture, origin);
  assert.equal(m.title.absolute, "Example Doctor | Gynaecologist | K.V.Rangareddy | Book My Professional");
  assert.match(m.description, /Example Doctor's Gynaecologist profile in K.V.Rangareddy/);
  assert.equal(m.openGraph.title, m.title.absolute);
  assert.equal(m.twitter.description, m.description);
  assert.deepEqual(m.keywords, []);
  assert.doesNotMatch(JSON.stringify(m), /Hyderabad|guaranteed|background.checked|verified/i);
});

test("partial and missing profiles have honest fallbacks", () => {
  assert.equal(buildProfileMetadata(id, { name: "Example" }, origin).title.absolute, "Example | Book My Professional");
  const m = buildProfileMetadata(id, null, origin);
  assert.equal(m.title.absolute, "Professional Profile | Book My Professional");
  assert.equal(m.alternates.canonical, `${origin}/professionals/${id}`);
  assert.doesNotMatch(m.description, /not found|verified|undefined|null/);
});

test("anonymous lookup selects only public metadata fields, exact ID and active rows", async () => {
  const row = await readPublicProfileMetadata(id, {
    url: "https://example.supabase.co/", anonKey: "dummy-public-key",
    fetcher: async (url, options) => {
      assert.equal(url.origin, "https://example.supabase.co");
      assert.equal(url.searchParams.get("select"), "id,name,role_title,category,subcategory,city");
      assert.equal(url.searchParams.get("id"), `eq.${id}`);
      assert.equal(url.searchParams.get("is_active"), "eq.true");
      assert.equal(url.searchParams.get("limit"), "1");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Authorization, "Bearer dummy-public-key");
      return { ok: true, json: async () => [fixture] };
    },
  });
  assert.deepEqual(row, fixture);
});

test("invalid IDs and missing config do not request data", async () => {
  const fetcher = () => { throw new Error("must not fetch"); };
  assert.equal(await readPublicProfileMetadata("invalid", { url: "https://example.supabase.co", anonKey: "dummy", fetcher }), null);
  assert.equal(await readPublicProfileMetadata(id, { url: "", anonKey: "", fetcher }), null);
});

test("not found, wrong ID, RLS failure, malformed data and timeouts fall back safely", async () => {
  for (const fetcher of [
    async () => ({ ok: true, json: async () => [] }),
    async () => ({ ok: true, json: async () => [{ ...fixture, id: "different" }] }),
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ error: "no data" }) }),
    async () => { throw new Error("timeout"); },
  ]) {
    assert.equal(await readPublicProfileMetadata(id, { url: "https://example.supabase.co", anonKey: "dummy", fetcher }), null);
  }
});
