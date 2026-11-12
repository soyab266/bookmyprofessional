import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Loads a metadata module by stripping module syntax, mirroring profile-robots.test.mjs.
async function load(path, names) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const executable = source.replace(/export default function[\s\S]*$/, "").replace(/^import .*;\n/gm, "").replace(/export /g, "");
  return new Function(`${executable}; return { ${names.join(", ")} };`)();
}

const EXPECTED = { index: false, follow: true };

for (const role of ["professional", "customer", undefined]) {
  test(`login ${role ?? "default"} metadata is noindex, follow with clean canonical`, async () => {
    const { generateMetadata } = await load("../src/app/login/page.jsx", ["generateMetadata"]);
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ role }) });
    assert.deepEqual(metadata.robots, EXPECTED);
    assert.equal(metadata.alternates.canonical, "https://www.bookmyprofessional.com/login");
    assert.ok(metadata.title.length > 0);
    assert.ok(metadata.description.length > 0);
  });
}

for (const role of ["professional", undefined]) {
  test(`register ${role ?? "default"} metadata is noindex, follow with clean canonical`, async () => {
    const { generateMetadata } = await load("../src/app/register/page.jsx", ["generateMetadata"]);
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ role }) });
    assert.deepEqual(metadata.robots, EXPECTED);
    assert.equal(metadata.alternates.canonical, "https://www.bookmyprofessional.com/register");
    assert.ok(metadata.title.length > 0);
  });
}

test("forgot-password layout metadata is noindex, follow with clean canonical", async () => {
  const { metadata } = await load("../src/app/forgot-password/layout.jsx", ["metadata"]);
  assert.deepEqual(metadata.robots, EXPECTED);
  assert.equal(metadata.alternates.canonical, "https://www.bookmyprofessional.com/forgot-password");
  assert.equal(metadata.title, "Reset Password");
});
