import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/professionals/[id]/layout.jsx", import.meta.url), "utf8");
// The route layout contains plain JS; load it without requiring a JSX loader.
const { generateMetadata, default: Layout } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookmyprofessional.com").replace(/\/+$/, "");

for (const id of [
  "22525cf7-47b7-4960-8158-ebcf0c8f1c71",
  "29952265-89ef-41a5-8471-94d475a4de46",
]) {
  test(`profile ${id} has its own server-generated canonical`, async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ id }) });
    assert.equal(metadata.alternates.canonical, `${origin}/professionals/${id}`);
    assert.notEqual(metadata.alternates.canonical, `${origin}/professionals`);
    assert.deepEqual(Object.keys(metadata), ["alternates"]);
  });
}

test("route ID cannot introduce a query or fragment into the canonical", async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ id: "sample?utm=x#section" }) });
  assert.equal(metadata.alternates.canonical, `${origin}/professionals/sample%3Futm%3Dx%23section`);
});

test("layout leaves the existing profile UI unchanged", () => {
  const children = { sentinel: true };
  assert.equal(Layout({ children }), children);
});

test("metadata remains server-side", () => {
  assert.doesNotMatch(source, /["']use client["']/);
});
