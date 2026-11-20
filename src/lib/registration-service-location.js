import { cleanPincode, isValidPincodeFormat } from "./pincode.js";

// A lookup for an older PIN must never populate the current registration form.
export function verifiedServiceLocation(pincode, result) {
  const pin = cleanPincode(pincode);
  if (!isValidPincodeFormat(pin) || !result?.valid || result.pincode !== pin) return null;
  const city = String(result.city || result.district || "").trim();
  if (!city) return null;
  return { city, state: String(result.state || "").trim() };
}
