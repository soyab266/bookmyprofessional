"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, ShieldCheck, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { cleanPhone, isValidIndianPhone } from "@/lib/phone";

// Internal, same-origin paths only; never loop back into auth or this page.
function safeNext(raw, role) {
  const fallback = role === "professional" ? "/vendor" : "/dashboard";
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw === "/" || raw === "/login" || raw === "/register" || raw.startsWith("/complete-profile")) return fallback;
  return raw;
}

export default function CompleteProfileClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isAuthLoading, showToast } = useAuth();
  const [phone, setPhone] = useState("");
  const [agreeWhatsApp, setAgreeWhatsApp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const role = user?.role === "professional" ? "professional" : "customer";
  const destination = safeNext(searchParams.get("next"), role);

  // Durable completion state (migration supabase/onboarding_completion_marker.sql):
  // onboarding_completed_at is set once when onboarding completes and is never
  // cleared - withdrawing WhatsApp consent in Settings does NOT reopen this
  // step. Accounts that existed at release are backfilled, so they are exempt
  // here and at the destination guards: legacy behavior is untouched.
  // Everyone this screen still serves (marker NULL and something missing) is a
  // new signup mid-onboarding, so the agreement is required, never optional.
  const hasPhone = Boolean(user?.phone) && cleanPhone(user.phone).length === 10;
  const onboardingComplete = Boolean(user?.onboarding_completed_at);
  const needsPhone = !hasPhone;
  const needsConsent = !user?.whatsapp_consent;
  const mustComplete = !onboardingComplete && (needsPhone || needsConsent);
  const consentRequired = mustComplete && needsConsent;

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // Never nag: completed accounts (and legacy-exempt ones) go straight on.
    if (!mustComplete) {
      router.replace(destination);
    }
  }, [user, isAuthLoading, destination, router, mustComplete]);

  // A user who only owes the agreement (number already saved) should not
  // have to retype it.
  useEffect(() => {
    if (hasPhone) setPhone((current) => current || cleanPhone(user.phone));
  }, [hasPhone, user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    if (!isValidIndianPhone(phone)) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (consentRequired && !agreeWhatsApp) {
      setErrorMessage(
        "Please agree to receive WhatsApp updates from BookMyProfessional to continue. You can turn them off anytime in Settings."
      );
      return;
    }
    if (!user?.id) return;
    setIsSaving(true);
    try {
      // Same save path as the dashboard profile form: the user's own session
      // updates their own profiles row (RLS). Setting the phone is what lets
      // an opted-in registration welcome find its number.
      const supabase = createClient();
      // Consent is written only when the user ticks the box themselves;
      // an unticked box never sets it, and an existing consent is left as-is.
      // onboarding_completed_at is set exactly once here and never cleared:
      // a later consent withdrawal in Settings must not reopen this step.
      const update = {
        phone: cleanPhone(phone),
        onboarding_completed_at: new Date().toISOString(),
      };
      if (agreeWhatsApp) update.whatsapp_consent = true;
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", user.id);
      if (error) throw error;
      showToast?.("Mobile number saved.", "success");
      router.replace(destination);
    } catch (err) {
      setErrorMessage(err?.message || "Could not save your number. Please try again.");
      setIsSaving(false);
    }
  };

  if (isAuthLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-5">
          <Phone className="w-6 h-6 text-primary-500" />
        </div>

        <h1 className="text-2xl font-bold text-dark-900 mb-2">One last step - your mobile number</h1>
        <p className="text-sm text-dark-600 mb-1">
          Google does not share your mobile number with BookMyProfessional.
        </p>
        <p className="text-sm text-dark-600 mb-6">
          {role === "professional"
            ? "Customers and our team need it to reach you about leads, bookings and payouts. A mobile number is required to continue."
            : "Professionals and our team need it to reach you about your bookings. A mobile number is required to continue."}
        </p>

        {user.whatsapp_consent && (
          <div className="flex items-start gap-2 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2.5 mb-6">
            <ShieldCheck className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
            <p className="text-xs text-dark-700 leading-relaxed">
              You opted in to WhatsApp updates during signup - they can only reach a saved number, and saving it here is not verification.
            </p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-dark-700 mb-1.5">Mobile Number *</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {needsConsent && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreeWhatsApp}
                onChange={(e) => setAgreeWhatsApp(e.target.checked)}
                className="mt-0.5 rounded text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0 cursor-pointer"
              />
              <span className="text-[11px] text-dark-600 leading-tight">
                I agree to receive booking updates, appointment reminders, and service
                notifications from BookMyProfessional on WhatsApp at this number. You can
                turn this off anytime in Settings.{" "}
                <span className="text-rose-500 font-medium">*</span>
              </span>
            </label>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 text-red-600 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
