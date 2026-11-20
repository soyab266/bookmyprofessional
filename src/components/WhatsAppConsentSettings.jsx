"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/data/profiles";

// The WhatsApp AGREEMENT control - distinct from the "WhatsApp notifications"
// topic toggle in Notification Preferences (notification_prefs.whatsapp).
// This card writes profiles.whatsapp_consent, the fail-closed gate every
// WhatsApp send checks. Off means no WhatsApp messages at all; the topic
// preferences only apply while this is on. Turning it on here is the user's
// own explicit opt-in; turning it off is withdrawal.
export default function WhatsAppConsentSettings() {
  const { user, showToast } = useAuth();
  const [consent, setConsent] = useState(null); // null = loading
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setConsent(null);
      return;
    }
    getProfile(user.id)
      .then((profile) => {
        if (!active) return;
        // getProfile returns null on a failed read as well as for a missing
        // row; never show "off" on a read failure - fall back to the
        // session's copy rather than misstating the user's agreement.
        setConsent(Boolean(profile ? profile.whatsapp_consent : user?.whatsapp_consent));
      })
      .catch(() => {
        if (active) setConsent(Boolean(user?.whatsapp_consent));
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const updateConsent = async (next) => {
    if (!user?.id || isSaving || consent === null) return;
    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ whatsapp_consent: next })
        .eq("id", user.id);
      if (error) throw error;
      setConsent(next);
      showToast?.(
        next
          ? "WhatsApp messages from BookMyProfessional turned on."
          : "WhatsApp messages turned off. BookMyProfessional will no longer message you on WhatsApp.",
        "success"
      );
    } catch {
      showToast?.("Could not update your WhatsApp setting right now. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 text-primary-500" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-dark-900">
            WhatsApp messages from BookMyProfessional
          </h4>
          <p className="text-[11px] text-dark-500 mt-1 leading-relaxed">
            {consent === null
              ? "Checking your WhatsApp setting..."
              : consent
                ? "You agreed to receive booking updates, appointment reminders, and service notifications from BookMyProfessional on WhatsApp. You can turn this off anytime; turning it off stops all WhatsApp messages."
                : "WhatsApp messages are off. Turn them on to agree to receive booking updates, appointment reminders, and service notifications from BookMyProfessional on WhatsApp."}
          </p>
        </div>
        <input
          type="checkbox"
          aria-label="WhatsApp messages from BookMyProfessional"
          checked={!!consent}
          disabled={consent === null || isSaving}
          onChange={(e) => updateConsent(e.target.checked)}
          className="mt-1 rounded text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0 cursor-pointer disabled:opacity-50"
        />
      </div>
      <p className="text-[10px] text-dark-400 leading-relaxed border-t border-border pt-2.5">
        This is your WhatsApp agreement with BookMyProfessional, separate from the
        notification topics below - those only apply while WhatsApp messages are on.
      </p>
    </div>
  );
}
