"use client";

import PincodeInput from "./PincodeInput";
import { verifiedServiceLocation } from "@/lib/registration-service-location";

export default function ServiceLocationFields({ profile, setProfile, result, onVerified }) {
  const location = verifiedServiceLocation(profile.pincode, result);
  const status = String(profile.pincode || "").length === 6
    ? (result ? "Location unavailable. Check service pincode." : "Checking service pincode...")
    : "Enter a valid service pincode";
  return <>
    <div>
      <PincodeInput
        value={profile.pincode || ""}
        onChange={(pincode) => {
          onVerified(null);
          setProfile((prev) => ({ ...prev, pincode, city: "", state: "" }));
        }}
        onVerified={(result) => {
          onVerified(result);
          setProfile((prev) => {
            const location = verifiedServiceLocation(prev.pincode, result);
            return location ? { ...prev, ...location } : { ...prev, city: "", state: "" };
          });
        }}
        enforceLocationMatch={false}
        label="Service Pincode"
        placeholder="e.g. 501218"
      />
    </div>
    <div>
      <label className="block text-xs font-semibold text-dark-700 mb-1.5">Service City &amp; State</label>
      <output className="block w-full px-3 py-2.5 bg-dark-50 border border-border rounded-xl text-xs text-dark-900 font-medium" aria-live="polite">
        {location ? `${location.city}${location.state ? `, ${location.state}` : ""}` : status}
      </output>
      <p className="text-[10px] text-dark-400 mt-1">Updates automatically when you change your service pincode.</p>
    </div>
  </>;
}
