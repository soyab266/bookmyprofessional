import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { profileViewState, PROFILE_ID_RE } from "../src/lib/profile-view.js";

const ID = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
const pro = { id: ID, name: "Example Doctor" };

test("a profile from either source is found", () => {
  assert.equal(profileViewState({ catalogPro: pro, proId: ID }), "found");
  assert.equal(
    profileViewState({ directPro: pro, directStatus: "found", isCatalogLoading: false, proId: ID }),
    "found"
  );
});

test("an unfinished catalog or by-id check is loading, never missing", () => {
  assert.equal(profileViewState({ isCatalogLoading: true, proId: ID }), "loading");
  // Catalog finished without the profile; the direct by-id read is still pending.
  assert.equal(profileViewState({ isCatalogLoading: false, directStatus: null, proId: ID }), "loading");
});

test("a failed by-id read is unavailable, never missing", () => {
  assert.equal(
    profileViewState({ isCatalogLoading: false, directStatus: "unknown", proId: ID }),
    "unavailable"
  );
  // An "unknown" result carrying no profile must not flip to found either.
  assert.notEqual(
    profileViewState({ isCatalogLoading: false, directStatus: "unknown", proId: ID }),
    "found"
  );
});

test("missing only when an authoritative read confirms absence", () => {
  assert.equal(
    profileViewState({ isCatalogLoading: false, directStatus: "missing", proId: ID }),
    "missing"
  );
});

test("non-UUID slugs rely on the catalog alone", () => {
  assert.ok(!PROFILE_ID_RE.test("example-doctor"));
  assert.equal(profileViewState({ isCatalogLoading: false, proId: "example-doctor" }), "missing");
});

register("./alias-loader.mjs", import.meta.url);
const { getProfessionalById } = await import("../src/lib/data/professionals.js");

const apiResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("getProfessionalById: API rows map to found/missing, failures to unknown", async () => {
  // In node (no window) there is no anon fallback, so API outcomes map directly.
  assert.deepEqual(
    await getProfessionalById(ID, { fetcher: async () => apiResponse({ rows: [pro] }) }),
    { status: "found", pro }
  );
  assert.deepEqual(
    await getProfessionalById(ID, { fetcher: async () => apiResponse({ rows: [] }) }),
    { status: "missing", pro: null }
  );
  for (const fetcher of [
    async () => apiResponse({ unexpected: true }), // malformed success body
    async () => apiResponse({ error: "boom" }, 500), // server error
    async () => { throw new Error("offline"); }, // network failure
  ]) {
    const result = await getProfessionalById(ID, { fetcher });
    assert.equal(result.status, "unknown");
    assert.equal(result.pro, null);
  }
});

test("getProfessionalById: the by-id API read stays bounded and active-only", async () => {
  let seen = null;
  await getProfessionalById(ID, {
    fetcher: async (url) => {
      seen = url;
      return apiResponse({ rows: [pro] });
    },
  });
  assert.equal(seen, `/api/professionals?id=${encodeURIComponent(ID)}`);
});

test("detail page keys its states on the catalog flag and honest statuses", async () => {
  const page = await readFile(new URL("../src/app/professionals/[id]/page.jsx", import.meta.url), "utf8");
  assert.ok(!page.includes('isLoadingProfessionals ? "Loading professional…"'));
  assert.match(page, /profileViewState\(\{ catalogPro, directPro, directStatus, isCatalogLoading, proId \}\)/);
  assert.match(page, /getProfessionalById\(proId\)/);
  assert.match(page, /"Unable to load this profile"/);
  assert.match(page, /window\.location\.reload\(\)/);
});

test("context exposes a catalog-owned loading flag separate from the directory one", async () => {
  const context = await readFile(new URL("../src/context/MarketplaceContext.jsx", import.meta.url), "utf8");
  assert.match(context, /const \[isCatalogLoading, setIsCatalogLoading\] = useState\(true\)/);
  assert.match(context, /setIsCatalogLoading\(needsCatalog\)/);
  assert.match(context, /isCatalogLoading,\n/);
});

test("professionals API supports a bounded single-profile read by id, active-only like the directory", async () => {
  const route = await readFile(new URL("../src/app/api/professionals/route.js", import.meta.url), "utf8");
  assert.match(route, /searchParams\.get\("id"\)/);
  assert.match(route, /\.eq\("id", id\)/);
  assert.match(route, /\.eq\("is_active", true\)/);
  assert.match(route, /\.maybeSingle\(\)/);
  const lib = await readFile(new URL("../src/lib/data/professionals.js", import.meta.url), "utf8");
  assert.match(lib, /export async function getProfessionalById\(id/);
  assert.match(lib, /\/api\/professionals\?id=\$\{encodeURIComponent\(id\)\}/);
});
