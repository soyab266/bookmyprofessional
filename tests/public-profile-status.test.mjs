import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPublicProfileStatus, profileNameMatches } from "../src/lib/public-profile-status.js";
const id = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
const opts = (rows, status = 200, inspect = () => {}) => ({
  url: "https://example.invalid", anonKey: "fixture-key",
  fetcher: async (url, init) => { inspect(url, init); return new Response(JSON.stringify(rows), { status, headers: { "content-range": `0-0/${Array.isArray(rows) ? rows.length : 0}` } }); },
});
test("UUID existence read uses only anonymous id, active=true, no-store and bounded timeout", async () => {
  assert.equal(await readPublicProfileStatus(id, opts([{id}], 200, (url, init) => {
    assert.equal(url.searchParams.get("select"), "id");
    assert.equal(url.searchParams.get("id"), `eq.${id}`);
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    assert.equal(url.searchParams.get("limit"), "1");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(Object.keys(init.headers).sort(), ["Authorization", "apikey"]);
    assert.ok(init.signal instanceof AbortSignal);
  })), "found");
  assert.equal(await readPublicProfileStatus(id, opts([])), "missing");
});
test("network/config/RLS HTTP/malformed responses never turn into confirmed missing", async () => {
  for (const o of [opts([], 403), opts({}, 200), opts([{id: "invalid"}]), opts([{id: "29952265-89ef-41a5-8471-94d475a4de46"}]), { url: "", anonKey: "" }, { url: "https://example.invalid", anonKey: "x", fetcher: async () => {throw Error("timeout");} }]) {
    assert.equal(await readPublicProfileStatus(id, o), "unknown");
  }
});
test("existing fuzzy name compatibility and ordering/cap are preserved without full profiles", async () => {
  const rows = [{ id, name: "Example Doctor" }];
  for (const path of ["example-doctor", "doctor", "example"]) {
    assert.equal(await readPublicProfileStatus(path, opts(rows, 200, url => {
      assert.equal(url.searchParams.get("select"), "id,name");
      assert.equal(url.searchParams.get("order"), "created_at.desc,id.asc");
      assert.equal(url.searchParams.get("limit"), "500");
    })), "found");
  }
  assert.equal(profileNameMatches("Dr. Example", "dr--example"), true);
  assert.equal(profileNameMatches("Example Doctor", "Doctor"), false);
  assert.equal(await readPublicProfileStatus("nobody", opts(rows)), "missing");
  assert.equal(await readPublicProfileStatus("nobody", opts([{id}])), "unknown");
});
test("server layout rejects only confirmed missing, leaves client detail body unchanged", async () => {
  const layout = await readFile(new URL("../src/app/professionals/[id]/layout.jsx", import.meta.url), "utf8");
  assert.match(layout, /if \(await readPublicProfileStatus\(id\) === "missing"\) notFound\(\)/);
  assert.match(layout, /buildProfileMetadata\(id, profile, SITE_URL\)/);
  const page = await readFile(new URL("../src/app/professionals/[id]/page.jsx", import.meta.url), "utf8");
  assert.ok(page.startsWith('"use client";'));
});

 test("unmatched full name window is incomplete, never confirmed missing", async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id, name: `Example ${i}` }));
  const truncated = opts(rows);
  truncated.fetcher = async () => new Response(JSON.stringify(rows), { headers: { "content-range": "0-499/501" } });
  assert.equal(await readPublicProfileStatus("outside-window", truncated), "unknown");
  assert.equal(await readPublicProfileStatus("example-499", opts(rows)), "found");
  assert.equal(await readPublicProfileStatus("outside-window", opts(rows.slice(0, 499))), "missing");
});

test("smaller provider row caps and missing total are not proof of name absence", async () => {
 const rows = [{ id, name: "Example" }];
 for (const headers of [{"content-range":"0-0/2"}, {}]) {
  const o = opts(rows);o.fetcher = async () => new Response(JSON.stringify(rows), {headers});
  assert.equal(await readPublicProfileStatus("missing-name", o), "unknown");
 }
});
