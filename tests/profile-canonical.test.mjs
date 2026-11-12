import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildProfileMetadata } from "../src/lib/profile-metadata.js";

const source = await readFile(new URL("../src/app/professionals/[id]/layout.jsx", import.meta.url), "utf8");
const origin = "https://www.bookmyprofessional.com";

for (const id of [
  "22525cf7-47b7-4960-8158-ebcf0c8f1c71",
  "29952265-89ef-41a5-8471-94d475a4de46",
]) {
  test(`profile ${id} retains its own canonical with and without data`, () => {
    for (const profile of [null, { name: "Example" }]) {
      const metadata = buildProfileMetadata(id, profile, origin);
      assert.equal(metadata.alternates.canonical, `${origin}/professionals/${id}`);
      assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    }
  });
}

test("route ID cannot introduce a query or fragment into the canonical", () => {
  const metadata = buildProfileMetadata("sample?utm=x#section", null, `${origin}/`);
  assert.equal(metadata.alternates.canonical, `${origin}/professionals/sample%3Futm%3Dx%23section`);
});

test("layout keeps the profile UI unchanged and metadata server-side", () => {
  assert.match(source, /return children;/);
  assert.doesNotMatch(source, /["']use client["']/);
  assert.match(source, /const \{ id \} = await params/);
  assert.match(source, /await readPublicProfileMetadata\(id\)/);
});
