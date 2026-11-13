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

test("server city query expands metro aliases and sanitizes every term", async () => {
  const source = await readFile(new URL("../src/lib/data/professionals.js", import.meta.url), "utf8");
  assert.match(source, /locationSearchTerms\(opts\.location === "all" \? "" : opts\.location\)/);
  assert.match(source, /\.map\(locationFilterTerm\)/);
  assert.match(source, /q = q\.ilike\("city", `%\$\{cityTerms\[0\]\}%`\)/);
  assert.match(source, /q = q\.or\(cityTerms\.map\(\(term\) => `city\.ilike\.%\$\{term\}%`\)\.join\(","\)\)/);
  assert.match(source, /const pincode = sanitizeTerm\(opts\.pincode\)/);
  assert.match(source, /if \(opts\.category && opts\.category !== "all"\)/);
});

test("metro alias groups live in one shared module used by search and pincode verification", async () => {
  const route = await readFile(new URL("../src/app/api/location/verify-pincode/route.js", import.meta.url), "utf8");
  assert.match(route, /from "@\/lib\/location-aliases"/);
  assert.doesNotMatch(route, /const METRO_ALIASES =/);
  const professionals = await readFile(new URL("../src/lib/data/professionals.js", import.meta.url), "utf8");
  assert.match(professionals, /from "\.\.\/location-aliases\.js"/);
  assert.doesNotMatch(professionals, /const METRO_ALIASES =/);
});
