import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifiedServiceLocation } from "../src/lib/registration-service-location.js";
const result = { valid: true, pincode: "400001", city: "Mumbai", state: "Maharashtra" };
test("blank and partial PINs never show a city", () => {
  for (const pin of ["", "4", "40000", "000001"]) assert.equal(verifiedServiceLocation(pin, result), null);
});
test("lookup must be completed and valid", () => {
  for (const res of [null, undefined, { ...result, valid: false }]) assert.equal(verifiedServiceLocation("400001", res), null);
});
test("old successful lookup cannot populate a different six-digit PIN", () => {
  assert.equal(verifiedServiceLocation("110001", result), null);
});
test("current verified lookup supplies city and state", () => {
  assert.deepEqual(verifiedServiceLocation("400001", result), { city: "Mumbai", state: "Maharashtra" });
});
test("district fallback is supported, but missing city and district blocks continuation", () => {
  assert.deepEqual(verifiedServiceLocation("400001", { ...result, city: "", district: "Mumbai" }), { city: "Mumbai", state: "Maharashtra" });
  assert.equal(verifiedServiceLocation("400001", { ...result, city: "", district: "" }), null);
});
test("form starts blank, clears every edit, and gates OTP on the matched lookup", () => {
  const source = readFileSync(new URL("../src/app/register/RegisterClient.jsx", import.meta.url), "utf8");
  assert.match(source, /city: "",\s+state: "",\s+pincode: ""/);
  assert.doesNotMatch(source, /city: "Mumbai"/);
  assert.match(source, /setProPincodeVerification\(null\);\s+setForm\(\(prev\) => \(\{ \.\.\.prev, pincode: val, city: "", state: "" \}\)\)/);
  assert.ok(source.indexOf("if (!verifiedServiceLocation(cleanPin, proPincodeVerification))") < source.indexOf("fetch('/api/auth/send-otp'"));
});

test("pincode edits immediately clear the old verified-location banner", () => {
  const source = readFileSync(new URL("../src/components/PincodeInput.jsx", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("const handleChange ="), source.indexOf("const isPostalValid"));
  assert.match(handler, /setVerificationResult\(null\)/);
  assert.match(handler, /lastCheckedRef.current = ""/);
});
test("registration hides the duplicate city box but keeps service pincode", () => {
  const source = readFileSync(new URL("../src/app/register/RegisterClient.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /City of Service & State/);
  assert.match(source, /label="Service Pincode"/);
  assert.match(source, /city: authRole === "professional" \? form.city : undefined/);
});
