import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublicSitemap, readPublicProfileIds, PUBLIC_ROUTES } from "../src/lib/profile-sitemap.js";

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const options = { url: "https://example.supabase.co/", anonKey: "dummy-public-key" };
const response = (rows, count, ok = true) => ({ ok, headers: new Headers({ "content-range": `0-0/${count}` }), json: async () => rows });

test("sitemap retains seven static URLs and adds only supplied public profile URLs without false dates", () => {
  const result = buildPublicSitemap([id(1), id(2)], "https://example.com/");
  assert.equal(result.length, 9);
  assert.deepEqual(result.slice(0, 7).map((r) => r.url), PUBLIC_ROUTES.map((p) => `https://example.com${p}`));
  assert.equal(result[7].url, `https://example.com/professionals/${id(1)}`);
  assert.ok(result.every((r) => Object.keys(r).join() === "url"));
});

test("anonymous read selects IDs of active profiles only and paginates beyond 1000 with stable ordering", async () => {
  let calls = 0;
  const ids = await readPublicProfileIds({ ...options, fetcher: async (url, opts) => {
    assert.equal(url.origin, "https://example.supabase.co");
    assert.equal(url.searchParams.get("select"), "id");
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    assert.equal(url.searchParams.get("order"), "id.asc");
    assert.equal(url.searchParams.get("limit"), "1000");
    assert.equal(url.searchParams.get("offset"), calls ? "1000" : "0");
    assert.deepEqual(opts.headers, { apikey: options.anonKey, Authorization: `Bearer ${options.anonKey}`, Prefer: "count=exact" });
    assert.equal(opts.cache, "no-store");
    assert.ok(opts.signal instanceof AbortSignal);
    const start = calls++ * 1000;
    return response(Array.from({ length: start ? 1 : 1000 }, (_, i) => ({ id: id(start + i) })), 1001);
  } });
  assert.equal(calls, 2);
  assert.equal(ids.length, 1001);
  assert.equal(ids.at(-1), id(1000));
});

test("empty public directory still keeps static URLs", async () => {
  const ids = await readPublicProfileIds({ ...options, fetcher: async () => response([], 0) });
  assert.deepEqual(ids, []);
  assert.equal(buildPublicSitemap(ids, "https://example.com").length, 7);
});

test("configuration, HTTP, network, timeout, malformed and incomplete reads fail instead of silently truncating", async () => {
  await assert.rejects(readPublicProfileIds({ url: "", anonKey: "" }));
  for (const fetcher of [
    async () => response([], 0, false),
    async () => { throw new Error("timeout"); },
    async () => ({ ok: true, headers: new Headers(), json: async () => [] }),
    async () => response({}, 1),
    async () => response([], 1),
    async () => response([{ id: "private/bad-id" }], 1),
    async () => response([{ id: id(1) }, { id: id(1) }], 2),
    async () => response([{ id: id(2) }, { id: id(1) }], 2),
    async () => response([{ id: id(1) }], 50000),
    async () => response([{ id: id(1) }], 0),
  ]) await assert.rejects(readPublicProfileIds({ ...options, fetcher }));
});

test("changed count between pages rejects a racing partial snapshot", async () => {
  let calls = 0;
  await assert.rejects(readPublicProfileIds({ ...options, fetcher: async () => {
    return calls++ ? response([{ id: id(2) }], 3) : response([{ id: id(1) }], 2);
  } }), /changed during pagination/);
});
