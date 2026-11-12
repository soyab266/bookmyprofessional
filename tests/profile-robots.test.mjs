import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildProfileMetadata } from "../src/lib/profile-metadata.js";

const source = await readFile(new URL("../src/app/professionals/[id]/layout.jsx", import.meta.url), "utf8");
const executable = source.replace(/^import .*;\n/gm, "").replace(/export default /g, "").replace(/export /g, "");
const id = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
function route(status) {
  return new Function("readPublicProfileStatus", "readPublicProfileMetadata", "buildProfileMetadata", "notFound", `${executable}; return { generateMetadata, ProfessionalProfileLayout };`)(
    async () => status,
    async () => ({ name: "Example Doctor", category: "Doctor", city: "Example City" }),
    buildProfileMetadata,
    () => { throw new Error("NOT_FOUND"); },
  );
}

test("confirmed missing clears inherited robots so native notFound supplies noindex", async () => {
  const r = route("missing");
  const metadata = await r.generateMetadata({ params: Promise.resolve({ id }) });
  assert.equal(metadata.robots, null);
  assert.equal(metadata.alternates.canonical, `https://www.bookmyprofessional.com/professionals/${id}`);
  await assert.rejects(r.ProfessionalProfileLayout({ params: Promise.resolve({ id }), children: "profile" }), /NOT_FOUND/);
});

for (const status of ["found", "unknown"]) {
  test(`${status} retains inherited indexability and profile body`, async () => {
    const r = route(status);
    const metadata = await r.generateMetadata({ params: Promise.resolve({ id }) });
    assert.equal(Object.hasOwn(metadata, "robots"), false);
    assert.equal(metadata.title.absolute, "Example Doctor | Doctor | Example City | Book My Professional");
    assert.equal(await r.ProfessionalProfileLayout({ params: Promise.resolve({ id }), children: "profile" }), "profile");
  });
}
