"use client";

import React, { useState, useEffect, useRef } from "react";
import { MapPin, CheckCircle2, AlertCircle, Loader2, Navigation, TriangleAlert } from "lucide-react";
import { cleanPincode, verifyPincode, isValidPincodeFormat } from "@/lib/pincode";
import { useLocationSafe } from "@/context/LocationContext";

export default function PincodeInput({
  value = "",
  onChange,
  onVerified,
  onCityDetected,
  label = "Pincode",
  placeholder = "e.g. 110001",
  required = false,
  disabled = false,
  className = "",
  autoFetchCity = true,
  enforceLocationMatch = true, // strict location check when live location is available
}) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [locationMismatch, setLocationMismatch] = useState(null); // null | { error: string }
  const lastCheckedRef = useRef("");

  // useLocationSafe returns null when used outside LocationProvider (e.g. admin area)
  const locationCtx = useLocationSafe();
  const { liveLocation, permissionStatus, checkPincodeLocationMatch } = locationCtx || {};

  useEffect(() => {
    const clean = cleanPincode(value);

    // Reset if input is less than 6 digits
    if (clean.length < 6) {
      setVerificationResult(null);
      setLocationMismatch(null);
      setVerifying(false);
      lastCheckedRef.current = "";
      return;
    }

    // Already checked this exact pincode — but re-run location match since liveLocation can change
    if (clean === lastCheckedRef.current && verificationResult) {
      if (verificationResult.valid && enforceLocationMatch && checkPincodeLocationMatch) {
        const match = checkPincodeLocationMatch(verificationResult);
        setLocationMismatch(match.matched ? null : match);
        const final = match.matched ? verificationResult : { ...verificationResult, valid: false, error: match.error };
        onVerified?.(final);
      }
      return;
    }

    // Strict format check before calling API
    if (!isValidPincodeFormat(clean)) {
      const err = { valid: false, error: "Pincode must be 6 digits and cannot start with 0." };
      setVerificationResult(err);
      setLocationMismatch(null);
      onVerified?.(err);
      return;
    }

    let isSubscribed = true;
    lastCheckedRef.current = clean;
    setVerifying(true);
    setLocationMismatch(null);

    const timer = setTimeout(async () => {
      try {
        const res = await verifyPincode(clean);
        if (!isSubscribed) return;

        // First set the raw postal result
        setVerificationResult(res);

        // Always auto-fill city from pincode (city must match pincode — force override)
        if (res.valid && autoFetchCity && (res.city || res.district)) {
          onCityDetected?.(res.city || res.district, res);
        }

        // Then cross-check against live location
        if (res.valid && enforceLocationMatch && checkPincodeLocationMatch) {
          const match = checkPincodeLocationMatch(res);
          if (!match.matched) {
            setLocationMismatch(match);
            // Emit as invalid so parent forms block submission
            onVerified?.({ ...res, valid: false, error: match.error });
          } else {
            setLocationMismatch(null);
            onVerified?.(res);
          }
        } else {
          onVerified?.(res);
        }
      } catch (e) {
        if (!isSubscribed) return;
        const fallbackErr = { valid: false, error: "Failed to verify pincode. Please try again." };
        setVerificationResult(fallbackErr);
        setLocationMismatch(null);
        onVerified?.(fallbackErr);
      } finally {
        if (isSubscribed) setVerifying(false);
      }
    }, 350);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, autoFetchCity, enforceLocationMatch, liveLocation]);

  const handleChange = (e) => {
    const cleaned = cleanPincode(e.target.value);
    // Do not label the new input with a previous pincode's verified location.
    setVerificationResult(null);
    setLocationMismatch(null);
    lastCheckedRef.current = "";
    onChange?.(cleaned);
  };

  const isPostalValid = verificationResult?.valid;
  const hasMismatch = !!locationMismatch;
  const isInvalid = (verificationResult && !verificationResult.valid) || hasMismatch;
  const isVerified = isPostalValid && !hasMismatch;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-dark-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          {verifying && (
            <span className="inline-flex items-center gap-1 text-[11px] text-primary-600 font-medium animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Verifying location...
            </span>
          )}
          {/* Show live location indicator when active */}
          {!verifying && liveLocation?.state && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
              <Navigation className="w-2.5 h-2.5" />
              Live: {liveLocation.city || liveLocation.district}, {liveLocation.state}
            </span>
          )}
        </div>
      )}

      <div className="relative">
        <MapPin
          className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
            isVerified
              ? "text-emerald-600"
              : isInvalid
              ? "text-red-500"
              : "text-dark-400"
          }`}
        />
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full pl-9 pr-9 py-2 bg-dark-50 border rounded-xl text-xs text-dark-900 transition-all focus:bg-white focus:outline-none ${
            isVerified
              ? "border-emerald-300 ring-2 ring-emerald-500/10 focus:border-emerald-500"
              : isInvalid
              ? "border-red-300 ring-2 ring-red-500/10 focus:border-red-500"
              : "border-border focus:border-primary-500"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        />

        {/* Right status icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
          {verifying ? (
            <Loader2 className="w-3.5 h-3.5 text-primary-500 animate-spin" />
          ) : isVerified ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
          ) : hasMismatch ? (
            <TriangleAlert className="w-4 h-4 text-amber-600 stroke-[2.5]" />
          ) : isInvalid ? (
            <AlertCircle className="w-4 h-4 text-red-500 stroke-[2.5]" />
          ) : null}
        </div>
      </div>

      {/* ✅ Verified Location Banner */}
      {isVerified && (
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-start gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Verified Location: </span>
            <span>
              {verificationResult.formattedLocation ||
                `${verificationResult.district}, ${verificationResult.state}`}
            </span>
          </div>
        </div>
      )}

      {/* ⚠️ Location Mismatch Warning (pincode is real, but wrong state) */}
      {hasMismatch && isPostalValid && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-[11px] text-amber-900 flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 mb-0.5">Location Mismatch Detected</p>
            <p className="leading-relaxed">{locationMismatch.error}</p>
          </div>
        </div>
      )}

      {/* ❌ Invalid Pincode Warning */}
      {isInvalid && !hasMismatch && (
        <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Location Error: </span>
            <span>{verificationResult?.error || "Invalid Indian postal code."}</span>
          </div>
        </div>
      )}

      {/* ℹ️ Note when no live location is available */}
      {!verifying && !liveLocation && permissionStatus === "dismissed" && value.length === 6 && isPostalValid && (
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-700 flex items-start gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Tip: </span>
            Enable live location in the top bar to verify this pincode matches your area.
          </span>
        </div>
      )}
    </div>
  );
}
