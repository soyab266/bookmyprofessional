import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { locationFilterTerm } from "../src/lib/location-filter.js";

test("location filtering preserves literal stored city punctuation", () => {
  assert.equal(locationFilterTerm("K.V.Rangareddy"), "K.V.Rangareddy");
  assert.equal(locationFilterTerm("  St. Thomas Mount  "), "St. Thomas Mount");
  assert.equal(locationFilterTerm("New Delhi"), "New Delhi");
  assert.equal(locationFilterTerm("Hyderabad"), "Hyderabad");
  assert.equal(locationFilterTerm(null), "");
});

test("PostgREST filter and wildcard punctuation remains sanitized", () => {
  for (const token of [",", "%", "(", ")", "*", ":", '"']) {
    assert.equal(locationFilterTerm(`A${token}B`), "A B");
  }
});

test("server city query uses the literal-safe term without changing other filters or adding aliases", async () => {
  const source = await readFile(new URL("../src/lib/data/professionals.js", import.meta.url), "utf8");
  assert.match(source, /const city = locationFilterTerm\(opts.location === "all" \? "" : opts.location\)/);
  // Coverage-city searches also match a pro's own declared Areas served;
  // every other place keeps the literal city ilike.
  assert.match(source, /city\.ilike\.%\$\{city\}%,service_areas\.cs\./);
  assert.match(source, /q = q\.ilike\("city", `%\$\{city\}%`\)/);
  assert.match(source, /const pincode = sanitizeTerm\(opts.pincode\)/);
  assert.match(source, /if \(opts.category && opts.category !== "all"\)/);
  assert.doesNotMatch(source, /METRO_ALIASES/);
});
