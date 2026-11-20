import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readPublicDirectory } from "../src/lib/public-directory.js";

const id = "22525cf7-47b7-4960-8158-ebcf0c8f1c71";
const opts = (rows, inspect = () => {}) => ({
  url: "https://example.invalid", anonKey: "fixture-key",
  fetcher: async (url, init) => { inspect(url, init); return new Response(JSON.stringify(rows), { status: 200, headers: { "content-range": `0-0/${rows.length}` } }); },
});

test("SSR public directory read excludes unverified professionals at the query level", async () => {
  const result = await readPublicDirectory("all", opts([{ id, name: "Example" }], (url) => {
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    assert.equal(url.searchParams.get("verified"), "eq.true");
    assert.equal(url.searchParams.get("verification_status"), "eq.approved");
  }));
  assert.equal(result.status, "ready");
});

test("browse-only verifiedOnly flag flows from context through listProfessionals into the API and query filters", async () => {
  const lib = await readFile(new URL("../src/lib/data/professionals.js", import.meta.url), "utf8");
  assert.match(lib, /if \(opts\.verifiedOnly\) q = q\.eq\("verified", true\)\.eq\("verification_status", "approved"\)/);
  assert.match(lib, /if \(opts\.verifiedOnly && !\(pro\.verified === true && pro\.verificationStatus === "approved"\)\) return false/);
  assert.match(lib, /if \(options\.verifiedOnly\) params\.set\("verifiedOnly", "true"\)/);

  const api = await readFile(new URL("../src/app/api/professionals/route.js", import.meta.url), "utf8");
  assert.match(api, /searchParams\.get\("verifiedOnly"\) === "true"/);
  assert.match(api, /verifiedOnly,\s*\n\s*\}\)/);

  const context = await readFile(new URL("../src/context/MarketplaceContext.jsx", import.meta.url), "utf8");
  assert.match(context, /const \[verifiedOnly, setVerifiedOnly\] = useState\(false\)/);
  assert.match(context, /near: nearCoords,\s*\n\s*verifiedOnly,/);
  assert.match(context, /nearCoords,\s*\n\s*verifiedOnly,\s*\n\s*\]\)/);

  const directory = await readFile(new URL("../src/components/MarketplaceDirectory.jsx", import.meta.url), "utf8");
  assert.match(directory, /setVerifiedOnly\(!preview\)/);
  assert.match(directory, /return \(\) => setVerifiedOnly\(false\)/);
});

test("homepage featured section keeps showing honestly labeled unverified professionals", async () => {
  const home = await readFile(new URL("../src/app/page.jsx", import.meta.url), "utf8");
  // Featured cards render status badges from the shared directory rows (unchanged behavior).
  assert.match(home, /verificationStatus/);
});

test("profile page disables booking CTAs until the professional is verified", async () => {
  const page = await readFile(new URL("../src/app/professionals/[id]/page.jsx", import.meta.url), "utf8");
  const gates = page.match(/!\(pro\.verified && pro\.verificationStatus === "approved"\)/g) || [];
  assert.equal(gates.length, 2);
  const labels = page.match(/Booking opens after verification/g) || [];
  assert.equal(labels.length, 2);
});

test("book page renders a blocked state instead of the wizard for unverified professionals", async () => {
  const page = await readFile(new URL("../src/app/book/[id]/page.jsx", import.meta.url), "utf8");
  assert.match(page, /if \(matchedPro && !\(matchedPro\.verified && matchedPro\.verificationStatus === "approved"\)\)/);
  assert.match(page, /Booking not available yet/);
  assert.match(page, /Browse Verified Professionals/);
});

test("createBooking re-checks verification against the database, not the client-supplied pro object", async () => {
  const bookings = await readFile(new URL("../src/lib/data/bookings.js", import.meta.url), "utf8");
  assert.match(bookings, /\.from\("professionals"\)\s*\n\s*\.select\("id, verified, verification_status"\)/);
  assert.match(bookings, /if \(!\(proRow\.verified === true && proRow\.verification_status === "approved"\)\)/);
  assert.match(bookings, /verification is still in progress/);
});

test("migration enforces verified professionals at the database and rollback is a clean drop", async () => {
  const sql = await readFile(new URL("../supabase/booking_requires_verified_professional.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.enforce_booking_verified_professional\(\) returns trigger/);
  assert.doesNotMatch(sql, /auth\.uid\(\) is null/);
  assert.match(sql, /pro_status is distinct from 'approved'/);
  assert.match(sql, /raise exception 'bookings require a verified professional'/);
  assert.match(sql, /before insert or update of professional_id on public\.bookings/);
  const rollback = await readFile(new URL("../supabase/booking_requires_verified_professional_rollback.sql", import.meta.url), "utf8");
  assert.match(rollback, /drop trigger if exists bookings_verified_professional_guard on public\.bookings/);
  assert.match(rollback, /drop function if exists public\.enforce_booking_verified_professional\(\)/);
});
